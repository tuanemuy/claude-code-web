# ユースケースを定義する

## 背景

- `CLAUDE.md` にガイダンスを記載した
- `docs/requirements.md` に要件を定義した
- `docs/schema.json` に想定されるチャットログのスキーマを記載した

## タスク

- 要件定義を満たすために必要なユースケースを列挙する

## 条件

- 対象ファイル
    - `docs/usecases_web.tsv`
    - `docs/usecases_daemon.tsv`
- TSV形式で記述する
- `docs/usecase_web.tsv` のカラム
    - 対象パス（共通レイアウト内の場合はワイルドカードを使う）
    - ユースケース名
    - 説明
- `docs/usecase_daemon.tsv` のカラム
    - ユースケース名
    - 説明
- 対象パス、ユースケース名は重複しても良い
- [対象パス, ユースケース名] の組み合わせは一意であること
