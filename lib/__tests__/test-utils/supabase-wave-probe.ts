export type SupabaseWaveMethod =
    | 'select'
    | 'eq'
    | 'neq'
    | 'in'
    | 'gte'
    | 'lt'
    | 'order'
    | 'range'
    | 'single'
    | 'returns';

export interface SupabaseWaveOperation {
    method: SupabaseWaveMethod;
    args: readonly unknown[];
}

export interface SupabaseWaveQueryResult {
    data: unknown;
    error: unknown;
}

export interface SupabaseWaveQuerySpec {
    label: string;
    wave: number;
    table: string;
    operations: readonly SupabaseWaveOperation[];
    result: SupabaseWaveQueryResult;
}

export interface SupabaseWaveQueryBuilder extends PromiseLike<SupabaseWaveQueryResult> {
    select(...args: readonly unknown[]): SupabaseWaveQueryBuilder;
    eq(...args: readonly unknown[]): SupabaseWaveQueryBuilder;
    neq(...args: readonly unknown[]): SupabaseWaveQueryBuilder;
    in(...args: readonly unknown[]): SupabaseWaveQueryBuilder;
    gte(...args: readonly unknown[]): SupabaseWaveQueryBuilder;
    lt(...args: readonly unknown[]): SupabaseWaveQueryBuilder;
    order(...args: readonly unknown[]): SupabaseWaveQueryBuilder;
    range(...args: readonly unknown[]): SupabaseWaveQueryBuilder;
    single(...args: readonly unknown[]): SupabaseWaveQueryBuilder;
    returns(): SupabaseWaveQueryBuilder;
}

export interface SupabaseWaveProbe {
    from(table: string): SupabaseWaveQueryBuilder;
    whenStarted(expectedLabels: readonly string[]): Promise<void>;
    releaseWave(expectedLabels: readonly string[]): void;
    getStartedLabels(): readonly string[];
    getCompletedWaves(): readonly (readonly string[])[];
    assertComplete(): void;
}

interface QueryDescriptor {
    table: string;
    operations: SupabaseWaveOperation[];
}

interface Deferred<T> {
    promise: Promise<T>;
    resolve: (value: T) => void;
    reject: (reason: Error) => void;
}

interface StartBarrier {
    expected: ReadonlySet<string>;
    resolve: () => void;
    reject: (reason: Error) => void;
}

function createDeferred<T>(): Deferred<T> {
    let resolvePromise: ((value: T) => void) | undefined;
    let rejectPromise: ((reason: Error) => void) | undefined;
    const promise = new Promise<T>((resolve, reject) => {
        resolvePromise = resolve;
        rejectPromise = reject;
    });

    return {
        promise,
        resolve: (value) => resolvePromise?.(value),
        reject: (reason) => rejectPromise?.(reason),
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function valuesEqual(left: unknown, right: unknown): boolean {
    if (Object.is(left, right)) return true;
    if (Array.isArray(left) && Array.isArray(right)) {
        return left.length === right.length
            && left.every((value, index) => valuesEqual(value, right[index]));
    }
    if (isRecord(left) && isRecord(right)) {
        const leftKeys = Object.keys(left).sort();
        const rightKeys = Object.keys(right).sort();
        return valuesEqual(leftKeys, rightKeys)
            && leftKeys.every((key) => valuesEqual(left[key], right[key]));
    }
    return false;
}

function operationMatches(
    actual: SupabaseWaveOperation,
    expected: SupabaseWaveOperation,
): boolean {
    return actual.method === expected.method && valuesEqual(actual.args, expected.args);
}

function queryMatches(descriptor: QueryDescriptor, spec: SupabaseWaveQuerySpec): boolean {
    if (descriptor.table !== spec.table) return false;
    const remaining = [...descriptor.operations];
    return spec.operations.every((expected) => {
        const matchIndex = remaining.findIndex((actual) => operationMatches(actual, expected));
        if (matchIndex < 0) return false;
        remaining.splice(matchIndex, 1);
        return true;
    });
}

function sortedLabels(labels: Iterable<string>): string[] {
    return [...labels].sort();
}

function labelSetsEqual(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
    return left.size === right.size && [...left].every((label) => right.has(label));
}

class ControlledSupabaseWaveProbe implements SupabaseWaveProbe {
    private readonly specs: readonly SupabaseWaveQuerySpec[];
    private readonly usedLabels = new Set<string>();
    private readonly startedLabels: string[] = [];
    private readonly currentStarted = new Set<string>();
    private readonly pending = new Map<string, Deferred<SupabaseWaveQueryResult>>();
    private readonly barriers = new Set<StartBarrier>();
    private readonly completedWaves: string[][] = [];
    private currentWave = 1;
    private failure: Error | null = null;

    constructor(specs: readonly SupabaseWaveQuerySpec[]) {
        this.specs = [...specs];
        const labels = new Set<string>();
        const waves = new Set<number>();
        for (const spec of this.specs) {
            if (labels.has(spec.label)) {
                throw new Error(`Duplicate query label: ${spec.label}`);
            }
            if (!Number.isInteger(spec.wave) || spec.wave < 1) {
                throw new Error('Query wave must be a positive integer');
            }
            labels.add(spec.label);
            waves.add(spec.wave);
        }
        const maxWave = Math.max(0, ...waves);
        for (let wave = 1; wave <= maxWave; wave += 1) {
            if (!waves.has(wave)) throw new Error(`Missing query wave: ${wave}`);
        }
    }

    from = (table: string): SupabaseWaveQueryBuilder => {
        const descriptor: QueryDescriptor = { table, operations: [] };
        const builder: SupabaseWaveQueryBuilder = {
            select: (...args) => append('select', args),
            eq: (...args) => append('eq', args),
            neq: (...args) => append('neq', args),
            in: (...args) => append('in', args),
            gte: (...args) => append('gte', args),
            lt: (...args) => append('lt', args),
            order: (...args) => append('order', args),
            range: (...args) => append('range', args),
            single: (...args) => append('single', args),
            returns: () => append('returns', []),
            then: (onFulfilled, onRejected) => (
                this.startQuery(descriptor).then(onFulfilled, onRejected)
            ),
        };

        function append(
            method: SupabaseWaveMethod,
            args: readonly unknown[],
        ): SupabaseWaveQueryBuilder {
            descriptor.operations.push({ method, args });
            return builder;
        }
        return builder;
    };

    async whenStarted(expectedLabels: readonly string[]): Promise<void> {
        this.throwFailure();
        const expected = this.validateExpectedLabels(expectedLabels);
        if (labelSetsEqual(this.currentStarted, expected)) return;

        const deferred = createDeferred<void>();
        const barrier: StartBarrier = {
            expected,
            resolve: () => deferred.resolve(undefined),
            reject: deferred.reject,
        };
        this.barriers.add(barrier);
        this.checkBarriers();
        await deferred.promise;
    }

    releaseWave(expectedLabels: readonly string[]): void {
        this.throwFailure();
        const expected = this.validateExpectedLabels(expectedLabels);
        if (!labelSetsEqual(this.currentStarted, expected)) {
            throw this.fail('Query wave released before all expected queries started');
        }

        const pendingGates = [...expected].map((label) => {
            const gate = this.pending.get(label);
            if (!gate) throw this.fail(`Missing query gate: ${label}`);
            this.pending.delete(label);
            return { label, gate };
        });
        this.completedWaves.push(sortedLabels(expected));
        this.currentStarted.clear();
        this.currentWave += 1;
        for (const { label, gate } of pendingGates) {
            const spec = this.specs.find((candidate) => candidate.label === label);
            if (!spec) throw this.fail(`Missing query specification: ${label}`);
            gate.resolve(spec.result);
        }
    }

    getStartedLabels(): readonly string[] {
        return [...this.startedLabels];
    }

    getCompletedWaves(): readonly (readonly string[])[] {
        return this.completedWaves.map((wave) => [...wave]);
    }

    assertComplete(): void {
        this.throwFailure();
        if (this.barriers.size > 0) throw new Error('Unresolved query start barrier');
        if (this.pending.size > 0) throw new Error('Unreleased query gate');
        if (this.usedLabels.size !== this.specs.length) {
            throw new Error('Unused query specifications remain');
        }
    }

    private startQuery(descriptor: QueryDescriptor): Promise<SupabaseWaveQueryResult> {
        try {
            this.throwFailure();
            const matchingSpecs = this.specs.filter((spec) => queryMatches(descriptor, spec));
            const unusedMatches = matchingSpecs.filter((spec) => !this.usedLabels.has(spec.label));
            if (unusedMatches.length === 0) {
                const duplicate = matchingSpecs.find((spec) => this.usedLabels.has(spec.label));
                throw this.fail(duplicate
                    ? `Duplicate query label: ${duplicate.label}`
                    : `Unexpected query: ${descriptor.table}`);
            }
            if (unusedMatches.length > 1) {
                throw this.fail(`Ambiguous query: ${descriptor.table}`);
            }

            const [spec] = unusedMatches;
            if (spec.wave !== this.currentWave) {
                throw this.fail(`Query order violation: ${spec.label}`);
            }

            const gate = createDeferred<SupabaseWaveQueryResult>();
            this.usedLabels.add(spec.label);
            this.startedLabels.push(spec.label);
            this.currentStarted.add(spec.label);
            this.pending.set(spec.label, gate);
            this.checkBarriers();
            return gate.promise;
        } catch (error: unknown) {
            return Promise.reject(error);
        }
    }

    private validateExpectedLabels(labels: readonly string[]): ReadonlySet<string> {
        const expected = new Set(labels);
        if (expected.size !== labels.length) {
            throw this.fail('Duplicate expected query label');
        }
        const specified = new Set(
            this.specs
                .filter((spec) => spec.wave === this.currentWave)
                .map((spec) => spec.label),
        );
        if (!labelSetsEqual(expected, specified)) {
            throw this.fail(`Query wave expectation mismatch: ${this.currentWave}`);
        }
        return expected;
    }

    private checkBarriers(): void {
        for (const barrier of [...this.barriers]) {
            const unexpectedStart = [...this.currentStarted]
                .some((label) => !barrier.expected.has(label));
            if (unexpectedStart) {
                this.fail('Unexpected query label in current wave');
                return;
            }
            if (labelSetsEqual(this.currentStarted, barrier.expected)) {
                this.barriers.delete(barrier);
                barrier.resolve();
            }
        }
    }

    private fail(message: string): Error {
        if (this.failure) return this.failure;
        this.failure = new Error(message);
        for (const gate of this.pending.values()) gate.reject(this.failure);
        this.pending.clear();
        for (const barrier of this.barriers) barrier.reject(this.failure);
        this.barriers.clear();
        return this.failure;
    }

    private throwFailure(): void {
        if (this.failure) throw this.failure;
    }
}

export function waveOperation(
    method: SupabaseWaveMethod,
    ...args: readonly unknown[]
): SupabaseWaveOperation {
    return { method, args };
}

export function createSupabaseWaveProbe(
    specs: readonly SupabaseWaveQuerySpec[],
): SupabaseWaveProbe {
    return new ControlledSupabaseWaveProbe(specs);
}
