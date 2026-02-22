---
applyTo: "**"
---

# ターミナルファイル操作の禁止（Heredoc 問題防止）

VS Code Copilot がターミナルの heredoc やシェルリダイレクトでファイルを作成・編集すると、
エンコーディングや改行コードの問題でファイルが破損するリスクがある。

## ルール

- ファイルの作成・編集には **必ず VS Code のファイル操作ツール** を使用する
- ターミナルで以下のコマンドを使ったファイル操作は**禁止**:
  - `cat << 'EOF' > file.txt` (heredoc)
  - `echo "content" > file.txt` (リダイレクト)
  - `printf "content" > file.txt`
  - `tee file.txt << EOF`
  - `Set-Content`, `Out-File`, `Add-Content` (PowerShell)

## 許可されるターミナル操作

- `mkdir` / `New-Item -ItemType Directory` — ディレクトリ作成
- `mv` / `Move-Item` — ファイル移動・リネーム
- `rm` / `Remove-Item` — ファイル削除
- `cp` / `Copy-Item` — ファイルコピー
- `git` コマンド全般
