BEGIN;

CREATE OR REPLACE FUNCTION public.get_group_challenge_progress(p_challenge_id uuid, p_viewer_id uuid)
RETURNS TABLE (
    status text, total_steps bigint, participant_count bigint, target_steps integer, is_completed boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    WITH challenge_scope AS MATERIALIZED (
        SELECT
            challenge.id,
            challenge.group_id,
            challenge.target_steps,
            challenge.start_date,
            challenge.end_date,
            COALESCE(challenge_group.is_public, false) AS is_public,
            EXISTS (
                SELECT 1
                FROM public.group_members AS viewer_membership
                WHERE viewer_membership.group_id = challenge.group_id
                  AND viewer_membership.user_id = p_viewer_id
            ) AS viewer_is_member,
            EXISTS (
                SELECT 1
                FROM public.challenge_participants AS viewer_participation
                WHERE viewer_participation.challenge_id = challenge.id
                  AND viewer_participation.user_id = p_viewer_id
            ) AS viewer_is_participant
        FROM public.challenges AS challenge
        JOIN public.groups AS challenge_group ON challenge_group.id = challenge.group_id
        WHERE challenge.id = p_challenge_id
          AND challenge.type = 'GROUP'
          AND challenge.group_id IS NOT NULL
    ),
    access_decision AS (
        SELECT COALESCE((
            SELECT CASE
                    WHEN NOT scope.viewer_is_member AND NOT scope.is_public THEN 'not_found'
                    WHEN NOT scope.viewer_is_member THEN 'forbidden'
                    WHEN NOT scope.viewer_is_participant THEN 'not_participating'
                    ELSE 'ok'
            END
            FROM challenge_scope AS scope
        ), 'not_found') AS status
    ),
    eligible_participants AS (
        SELECT DISTINCT participant.user_id
        FROM challenge_scope AS scope
        JOIN access_decision AS access ON access.status = 'ok'
        JOIN public.challenge_participants AS participant ON participant.challenge_id = scope.id
        JOIN public.group_members AS current_member
          ON current_member.group_id = scope.group_id
         AND current_member.user_id = participant.user_id
    ),
    progress AS (
        SELECT
            COUNT(DISTINCT eligible.user_id)::bigint AS participant_count,
            COALESCE(SUM(step.steps::bigint) FILTER (WHERE step.steps > 0), 0::bigint)
                AS total_steps
        FROM eligible_participants AS eligible
        LEFT JOIN challenge_scope AS scope ON true
        LEFT JOIN public.daily_steps AS step
          ON step.user_id = eligible.user_id
         AND step.date >= scope.start_date
         AND step.date <= scope.end_date
    )
    SELECT
        access.status,
        CASE WHEN access.status = 'ok' THEN progress.total_steps END,
        CASE WHEN access.status = 'ok' THEN progress.participant_count END,
        CASE WHEN access.status = 'ok' THEN scope.target_steps END,
        CASE
            WHEN access.status = 'ok'
            THEN progress.total_steps >= scope.target_steps::bigint
        END
    FROM access_decision AS access
    LEFT JOIN challenge_scope AS scope ON true
    CROSS JOIN progress;
$$;

REVOKE ALL ON FUNCTION public.get_group_challenge_progress(uuid, uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_group_challenge_progress(uuid, uuid)
TO service_role;

COMMENT ON FUNCTION public.get_group_challenge_progress(uuid, uuid) IS
'Service-role boundary for fail-closed GROUP challenge progress aggregation.';

COMMIT;

-- Rollback: REVOKE EXECUTE ON FUNCTION public.get_group_challenge_progress(uuid, uuid) FROM service_role;
-- DROP FUNCTION IF EXISTS public.get_group_challenge_progress(uuid, uuid);
