# TinyUSB MIDI Footswitch Configurator

WebMIDI APIを使用したTinyUSB MIDI フットスイッチデバイス設定ツール

## 概要

このWebアプリケーションは、TinyUSB MIDIフットスイッチデバイスの設定をブラウザから行うためのツールです。WebMIDI APIとSysExメッセージを使用して、デバイスの動作設定を読み書きできます。

## 機能

- **デバイス接続管理**: 利用可能なMIDIデバイスの検出と接続
- **設定の読み書き**: SysExプロトコルによるデバイス設定の送受信
- **4つの設定項目**: Switch1/2 × Press/Releaseの個別設定
- **設定の保存/読み込み**: ローカルファイルへの設定保存と読み込み
- **リアルタイムログ**: 通信状況とエラーの表示
- **レスポンシブデザイン**: モバイルデバイスにも対応

## 必要要件

- **ブラウザ**: Chrome, Edge, Opera（WebMIDI API対応ブラウザ）
- **デバイス**: TinyUSB MIDI Footswitchデバイス
- **権限**: SysExメッセージの送受信権限

## 使用方法

### 1. アプリケーションの起動

1. 直接ファイルを開く:
   - `config-app/index.html`をWebMIDI対応ブラウザで直接開く
   
2. ローカルサーバーを使用する場合:
   ```bash
   cd config-app
   npx serve .
   # ブラウザで表示されるURL（通常 http://localhost:3000）を開く
   ```

### 2. デバイスの接続

1. TinyUSB MIDI FootswitchデバイスをUSBで接続
2. **Device Connection**セクションのドロップダウンからデバイスを選択
3. **Connect**ボタンをクリック
4. ブラウザのMIDIアクセス許可ダイアログで許可を選択

### 3. 設定の読み込み

1. デバイス接続後、**Read from Device**ボタンをクリック
2. 現在のデバイス設定が各フォームに反映される
3. ログエリアで通信状況を確認

### 4. 設定の編集

各スイッチの設定項目:

- **Type**: メッセージタイプ（None/CC/PC/Note）
  - None: 何もしない（MIDIメッセージを送信しない）
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
  - PC: 使用しない
  - Note: ベロシティ（0-127）

### 5. 設定の書き込み

1. 設定を編集後、**Write to Device**ボタンをクリック
2. 設定がデバイスに送信される
3. デバイスは設定を不揮発性メモリに保存

### 6. 設定の保存/読み込み（ローカル）

- **Save to File**: 現在の設定をJSONファイルとして保存
- **Load from File**: 保存したJSONファイルから設定を読み込み

## SysExプロトコル仕様

### メッセージフォーマット

#### 設定書き込み
```
F0 00 7D 01 01 <switch> <event> <msgtype> <channel> <param1> <param2> F7
```

#### 設定読み出し要求
```
F0 00 7D 01 02 F7
```

#### 設定読み出し応答
```
F0 00 7D 01 03 <switch> <event> <msgtype> <channel> <param1> <param2> F7
```

### パラメータ説明

| パラメータ | 値 | 説明 |
|-----------|-----|------|
| `<switch>` | 0-1 | 0=Switch1(Tip), 1=Switch2(Ring) |
| `<event>` | 0-1 | 0=Press, 1=Release |
| `<msgtype>` | 0-3 | 0=None(何もしない), 1=CC, 2=PC, 3=Note |
| `<channel>` | 0-15 | MIDIチャンネル（0ベース） |
| `<param1>` | 0-127 | CC/PC/Note番号 |
| `<param2>` | 0-127 | CC値/Noteベロシティ |

## トラブルシューティング

### デバイスが表示されない

1. デバイスが正しく接続されているか確認
2. デバイスのファームウェアが正しく書き込まれているか確認
3. **Refresh**ボタンをクリックして再検索
4. ブラウザを再起動

### 設定が読み込めない

1. デバイスとの接続状態を確認
2. ログエリアでエラーメッセージを確認
3. デバイスを再接続して再試行

### WebMIDI APIが利用できない

1. 対応ブラウザ（Chrome, Edge, Opera）を使用
2. HTTPSまたはlocalhostでアクセス（セキュリティ要件）
3. ブラウザの設定でMIDIアクセスが許可されているか確認

### SysExメッセージが送信できない

1. ブラウザのMIDI権限設定でSysExが許可されているか確認
2. デバイスがSysExメッセージに対応しているか確認

## デフォルト設定

| スイッチ | イベント | タイプ | チャンネル | パラメータ1 | パラメータ2 | 説明 |
|----------|----------|--------|------------|-------------|-------------|------|
| Switch 1 | Press | CC | 1 | 64 | 127 | Sustain Pedal On |
| Switch 1 | Release | CC | 1 | 64 | 0 | Sustain Pedal Off |
| Switch 2 | Press | PC | 1 | 1 | - | Program Change #1 |
| Switch 2 | Release | PC | 1 | 0 | - | Program Change #0 |

## 開発情報

### ファイル構成

```
config-app/
├── index.html       # メインHTML
├── style.css        # スタイルシート
├── app.js           # アプリケーションロジック
├── midi-manager.js  # MIDI通信管理
└── README.md        # このファイル
```

### 技術スタック

- **HTML5**: 構造とレイアウト
- **CSS3**: スタイリングとレスポンシブデザイン
- **JavaScript (ES6+)**: アプリケーションロジック
- **WebMIDI API**: MIDI通信
- **Local Storage API**: 設定の保存

### ブラウザ互換性

| ブラウザ | サポート | 備考 |
|---------|---------|------|
| Chrome | ✅ | v43以降 |
| Edge | ✅ | v79以降 |
| Opera | ✅ | v30以降 |
| Firefox | ❌ | WebMIDI未対応 |
| Safari | ❌ | WebMIDI未対応 |

## ライセンス

このプロジェクトはMITライセンスの下で公開されています。

## 更新履歴

### v1.0.0 (2024-01)
- 初回リリース
- 基本的な設定読み書き機能
- ローカル保存/読み込み機能
- リアルタイムログ表示