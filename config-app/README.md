# TinyUSB MIDI Footswitch Configurator (Multi-Switch/Multi-Message)

Vue.js 3 + WebMIDI APIを使用したTinyUSB MIDI フットスイッチデバイス設定ツール（複数スイッチ・複数メッセージ対応）

## 概要

このWebアプリケーションは、TinyUSB MIDIフットスイッチデバイスの設定をブラウザから行うためのツールです。Vue.js 3 Composition APIによる最新のリアクティブUIと、WebMIDI APIを活用したSysExプロトコル通信により、複数スイッチ・複数メッセージに対応した高度な設定管理を提供します。

## 機能

- **Vue.js 3 Composition API**: 高速でリアクティブなモダンWeb UI
- **複数スイッチ対応**: 1〜16個のスイッチを動的に検出・設定
- **複数メッセージ管理**: 各スイッチのPress/Releaseイベント毎に最大10個のMIDIメッセージを設定
- **デバイス自動検出**: TinyUSB MIDI Footswitchの自動認識・接続
- **リアルタイム変更検出**: 未保存変更のディープ比較による視覚的フィードバック
- **設定バックアップ**: JSON形式でのローカルファイル保存・復元
- **ライブコミュニケーションログ**: SysEx通信とエラーのリアルタイム表示
- **ローディング状態管理**: 設定読み込み・保存時のUI無効化
- **レスポンシブデザイン**: モバイルデバイス対応ダークテーマ

## 必要要件

- **ブラウザ**: Chrome, Edge, Opera（WebMIDI API対応ブラウザ）
- **デバイス**: TinyUSB MIDI Footswitchデバイス
- **権限**: SysExメッセージの送受信権限

## 使用方法

### 1. アプリケーションの起動

1. 直接ファイルを開く:
   - `config-app/index.html`をWebMIDI対応ブラウザで直接開く
   
2. ローカルサーバーを使用する場合（推奨）:
   ```bash
   cd config-app
   npm run serve
   # または: npx serve .
   # ブラウザで表示されるURL（通常 http://localhost:3000）を開く
   ```

**各メッセージの設定項目:**

- **Type**: メッセージタイプ（None/CC/PC/Note）
  - None: 無効（MIDIメッセージを送信しない）
  - CC: Control Change
  - PC: Program Change
  - Note: Note On/Off
- **Channel**: MIDIチャンネル（1-16）
- **Parameter 1**: 
  - CC: CC番号（0-127）
  - PC: プログラム番号（0-127）
  - Note: ノート番号（0-127）
- **Parameter 2**:
  - CC: 値（0-127）
  - PC: 未使用（0固定）
  - Note: ベロシティ（0-127）

**変更検出機能:**
- 未保存の変更があるスイッチ・イベントは視覚的にハイライト表示
- 変更されたメッセージは個別に強調表示

### 5. 設定の書き込み

1. 設定を編集後、**Save Configurations**ボタンをクリック
2. 新しいSysExプロトコルで各スイッチの設定が個別に送信される
3. デバイスは設定を不揮発性フラッシュメモリに自動保存
4. 送信状況はリアルタイムログで確認可能

### 6. 設定のバックアップ/復元

- **Save to File**: 現在の設定をJSON形式でローカルファイルに保存
- **Load from File**: 保存したJSONファイルから設定を復元
- バックアップには全スイッチの全メッセージ設定が含まれる

## 開発情報

### ファイル構成

```
config-app/
├── index.html           # メインHTML（Vue.js CDN読み込み）
├── app.js               # Vue.js 3 Composition API アプリケーション
├── midi-manager.js      # WebMIDI API ラッパーとSysExプロトコル
├── style.css            # ダークテーマUI + レスポンシブデザイン
├── package.json         # NPM設定（v2.0.0, ESLint設定含む）
├── eslint.config.js     # ESLint設定（ES6+ + globals）
└── README.md            # このファイル
```

### 技術スタック

- **Vue.js 3**: Composition API、リアクティブ状態管理、computed properties
- **HTML5**: ES6 Modules、Import Maps による依存関係管理
- **CSS3**: Grid Layout、ダークテーマ、レスポンシブデザイン
- **JavaScript (ES6+)**: ES Modules、Async/Await、Event-driven architecture
- **WebMIDI API**: SysExメッセージ送受信、デバイス状態監視
- **File API**: JSON形式での設定バックアップ・復元
- **ESLint**: コード品質管理（ES6+対応）
