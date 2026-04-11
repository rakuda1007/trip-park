# GitHub で TripPark を管理する（テニスパークとは別リポジトリ）

このフォルダは **Git で管理**され、**GitHub 上の別リポジトリ**に push してバックアップ・履歴管理できます。GitHub のアカウントはテニスパークと**共通**で問題ありません（リポジトリだけ新しく作ります）。

## すでに済んでいること

- `git init` 済み、初期コミット済み、既定ブランチは **`main`**
- このリポジトリだけの作者設定（`git config user.name` / `user.email`）は **ローカル**に入れてあります。表示名やメールを変えたい場合は後述。

## 初めて GitHub に載せる手順

### 1. GitHub で空のリポジトリを新規作成

1. [GitHub](https://github.com) にログイン（テニスパークと同じアカウントで可）。
2. 右上 **+** → **New repository**。
3. **Repository name** に例: `trip-park`（テニスパークの名前と被らなければ任意）。
4. **Public / Private** は好みで選ぶ。
5. **Add a README / .gitignore / license は追加しない**（ローカルに既にあるため）。
6. **Create repository**。

### 2. パソコンから紐づけて push

作成直後の画面に表示される URL（HTTPS または SSH）を使います。例は **HTTPS** です。

```bash
cd "このプロジェクトのフォルダ"
git remote add origin https://github.com/<あなたのユーザー名>/<リポジトリ名>.git
git push -u origin main
```

- すでに `origin` がある場合は `git remote -v` で確認し、必要なら `git remote remove origin` のあと、再度 `git remote add origin ...`。
- 認証はテニスパークで使っている方法（ブラウザ、Personal Access Token、SSH など）と同じで構いません。

### 3. 以降の作業の流れ（ざっくり）

```bash
git add -A
git status
git commit -m "変更内容の説明"
git push
```

## コミットの作者名・メールを直したい

GitHub の **Settings → Emails** に表示される **noreply** などに合わせると、コミットとアカウントの紐づきがきれいになります。

このリポジトリだけ変える例:

```bash
git config user.name "表示したい名前"
git config user.email "GitHubで使うメールまたはnoreply"
```

直前の1コミットの作者だけ直す例:

```bash
git commit --amend --reset-author --no-edit
```

## 秘密情報について

- `.env.local`（Firebase のキーなど）は **`.gitignore` で除外**されており、通常はコミットされません。
- 誤ってコミットした場合は履歴から消す必要があるため、push 前に `git status` で必ず確認してください。
