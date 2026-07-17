# Upstream source

- Repository: https://github.com/nutlope/hallmark
- Version: Hallmark 1.1.0
- Pinned commit: `aeb42fb354ff4efa36ab475773a082315a3af2ce`
- Source path: `skills/hallmark/`
- License: MIT; see `LICENSE`

## Reproducible update

1. Clone `https://github.com/nutlope/hallmark.git` into a temporary directory.
2. Check out the intended immutable commit.
3. Review the upstream license and version metadata.
4. Replace local `SKILL.md` and `references/` with the exact contents of
   `skills/hallmark/` at that commit.
5. Update this file and `LICENSE` when the pinned source or attribution changes.
6. Compare recursively, excluding only local `LICENSE` and `UPSTREAM.md`:

   ```shell
   diff -qr \
     --exclude LICENSE \
     --exclude UPSTREAM.md \
     <temporary-clone>/skills/hallmark \
     .github/skills/hallmark
   ```

7. Run `npm run check:agents`, record file-count and SHA-256 parity evidence,
   then remove the temporary clone.
