# TinyUSB MIDI Footswitch

Raspberry Pi Picoを使用したUSB MIDI フットスイッチデバイス

## 概要

TinyUSB MIDI Footswitchは、Raspberry Pi Pico（RP2040）を使用して実装されたUSB MIDIデバイスです。TRSジャック経由で最大2つのフットスイッチを接続でき、各スイッチのPress/Releaseイベントを設定可能なMIDIメッセージに変換して送信します。

## 主な機能

- **2スイッチ対応**: TRSジャック（Tip/Ring）経由で2つの独立したスイッチ
- **USB MIDI出力**: CC（Control Change）、PC（Program Change）、Note On/Off対応
- **SysEx設定変更**: リアルタイムでの設定変更とデバイスからの設定読み出し
- **不揮発性設定保存**: フラッシュメモリに設定を永続保存
- **デバウンス処理**: 20msのハードウェアデバウンス
- **WebMIDI設定ツール**: ブラウザベースの設定管理ツール付属

## 必要なハードウェア

### 基本部品
- **Raspberry Pi Pico** × 1
- **3.5mm TRSジャック** × 1（ステレオジャック）
- **ケース**（3Dプリントまたは市販）

### フットスイッチ
- **TRSケーブル対応フットスイッチ** × 1-2
- または**TRSケーブル** + **個別フットスイッチ** × 1-2

## ピン配置と配線

### Raspberry Pi Picoピン配置

```
Raspberry Pi Pico (RP2040)
┌─────────────────────────────┐
│ GP0  ┊ ┊ ┊ ┊ ┊ ┊ ┊ ┊ VBUS │
│ GP1  ┊ ┊ ┊ ┊ ┊ ┊ ┊ ┊ VSYS │
│ GND  ┊ ┊ ┊ ┊ ┊ ┊ ┊ ┊ GND  │
│ GP2  ┊ ┊ ┊ ┊ ┊ ┊ ┊ ┊ ┊    │
│ GP3  ●─────────────────────→ │ TIP (Switch 1)
│ GP4  ●─────────────────────→ │ RING (Switch 2)  
│ GP5  ┊ ┊ ┊ ┊ ┊ ┊ ┊ ┊ 3V3E │
│ GND  ●─────────────────────→ │ SLEEVE (GND)
│ :    ┊ ┊ ┊ ┊ ┊ ┊ ┊ ┊ :    │
└─────────────────────────────┘
```

### TRSジャック配線

```
TRSジャック（3.5mm ステレオ）
    ┌─ TIP ────→ GP3 (Switch 1)
    │
    ├─ RING ───→ GP4 (Switch 2)
    │
    └─ SLEEVE ─→ GND
```

### 回路図

```
GP3  ●─────●─── TIP (Switch 1)
     │       │   
    [内部]   │   ※内部プルアップ有効
   プルアップ │
     │       │
    3.3V   ┌─●─┐ フットスイッチ1
           │   │ (Normally Open)
           └─●─┘
             │
            GND

GP4  ●─────●─── RING (Switch 2)
     │       │
    [内部]   │   ※内部プルアップ有効 
   プルアップ │
     │       │
    3.3V   ┌─●─┐ フットスイッチ2
           │   │ (Normally Open)
           └─●─┘
             │
            GND ──── SLEEVE
```

## ファームウェアのビルドと書き込み

### 前提条件

1. **Pico SDK**の設定済み環境
2. **CMake 3.13以上**
3. **ARM GCC コンパイラ**
4. **Ninja** (推奨)

### ビルド手順

```bash
# リポジトリのクローン
git clone <repository-url>
cd hello_usb

# ビルドディレクトリの作成
mkdir build
cd build

# CMake設定
cmake .. -G Ninja

# ビルド実行
ninja
```

### 書き込み方法

#### 方法1: UF2ファイルでの書き込み（推奨）

1. **BOOTSELボタン**を押しながらRaspberry PicoをUSBでPCに接続
2. `RPI-RP2`ドライブとしてマウントされる
3. `build/tinyusbmidi.uf2`を`RPI-RP2`ドライブにドラッグ&ドロップ
4. 自動的に再起動してファームウェアが実行される

#### 方法2: picotoolを使用

```bash
# Picoを BOOTSEL モードで接続後
picotool load tinyusbmidi.uf2
picotool reboot
```

#### 方法3: SWD/デバッガを使用

```bash
# デバッガ接続時
openocd -f interface/picoprobe.cfg -f target/rp2040.cfg -c "program tinyusbmidi.elf verify reset exit"
```

## デフォルト設定

| スイッチ | イベント | MIDI | チャンネル | パラメータ1 | パラメータ2 | 説明 |
|----------|----------|------|------------|-------------|-------------|------|
| Switch 1 | Press | CC | 1 | 64 | 127 | Sustain Pedal On |
| Switch 1 | Release | CC | 1 | 64 | 0 | Sustain Pedal Off |
| Switch 2 | Press | PC | 1 | 1 | - | Program Change #1 |
| Switch 2 | Release | PC | 1 | 0 | - | Program Change #0 |

## 使用方法

### 基本的な使用

1. ファームウェアを書き込んだRaspberry PicoをPCに接続
2. MIDIデバイス「TinyUSB MIDI Footswitch」として認識される
3. フットスイッチを接続（TRSケーブル経由）
4. DAWやMIDIソフトでデバイスを選択
5. フットスイッチ操作でMIDIメッセージが送信される

### 設定変更

#### WebMIDI設定ツール（推奨）

1. `config-app/index.html`をChrome/Edge/Operaで開く
2. デバイスを接続して設定を読み込み・編集
3. 詳細は [`config-app/README.md`](config-app/README.md) を参照

#### SysExメッセージでの直接制御

設定仕様は [`sysex_test_samples.md`](sysex_test_samples.md) を参照

## SysExプロトコル

### 設定書き込み
```
F0 00 7D 01 01 <switch> <event> <msgtype> <channel> <param1> <param2> F7
```

### 設定読み出し要求
```
F0 00 7D 01 02 F7
```

### 設定読み出し応答
```
F0 00 7D 01 03 <switch> <event> <msgtype> <channel> <param1> <param2> F7
```

### パラメータ説明
- `<switch>`: 0=Switch1(Tip), 1=Switch2(Ring)
- `<event>`: 0=Press, 1=Release  
- `<msgtype>`: 0=None(何もしない), 1=CC, 2=PC, 3=Note
- `<channel>`: MIDI Channel (0-15)
- `<param1>`: CC Number/PC Number/Note Number (0-127)
- `<param2>`: CC Value/Note Velocity (0-127)

詳細なパラメータと使用例は [`sysex_test_samples.md`](sysex_test_samples.md) を参照してください。

## トラブルシューティング

### デバイスが認識されない

1. **ファームウェア確認**: 正しくビルド・書き込みされているか
2. **USB接続確認**: ケーブルとポートの確認
3. **デバイスマネージャー確認**（Windows）: 「サウンド、ビデオ、およびゲーム コントローラー」に表示される

### スイッチが反応しない

1. **配線確認**: TRSジャックの配線を確認
2. **スイッチテスト**: テスターでスイッチの導通確認
3. **デバウンス**: 20ms以内の連続操作は無視される

### 設定が保存されない

1. **SysEx送信確認**: 正しいフォーマットで送信されているか
2. **フラッシュ領域**: 256KB以降の領域を使用（競合確認）
3. **電源再投入**: 設定変更後の動作確認

### MIDI出力が正しくない

1. **チャンネル設定**: 0ベース（内部）vs 1ベース（表示）の確認
2. **メッセージタイプ**: CC/PC/Noteの選択確認
3. **パラメータ範囲**: 0-127の範囲内であることを確認

## 開発情報

### ファイル構成

```
├── README.md                    # このファイル
├── plan.md                      # 設計仕様書
├── sysex_test_samples.md        # SysEx仕様とテストデータ
├── CMakeLists.txt               # ビルド設定
├── tinyusbmidi.c               # メイン実装
├── usb_descriptors.c           # USB MIDI記述子
├── tusb_config.h               # TinyUSB設定
├── pico_sdk_import.cmake       # Pico SDK導入
├── build/                      # ビルド出力
│   ├── tinyusbmidi.uf2        # 書き込み用ファイル
│   ├── tinyusbmidi.elf        # 実行ファイル
│   └── ...
└── config-app/                # WebMIDI設定ツール
    ├── index.html
    ├── app.js
    ├── midi-manager.js
    ├── style.css
    └── README.md
```

### 技術スタック

- **MCU**: Raspberry Pi Pico (RP2040)
- **SDK**: Raspberry Pi Pico SDK
- **USB**: TinyUSB ライブラリ
- **MIDI**: USB MIDI Device Class
- **ビルドシステム**: CMake + Ninja
- **設定ツール**: WebMIDI API + HTML5

### 対応DAW/ソフトウェア

- ✅ **Ableton Live**
- ✅ **FL Studio** 
- ✅ **Logic Pro X**
- ✅ **Cubase/Nuendo**
- ✅ **Pro Tools**
- ✅ **Reaper**
- ✅ **Bitwig Studio**
- ✅ **その他USB MIDI対応ソフト**

## ライセンス

このプロジェクトはMITライセンスの下で公開されています。

## 貢献

バグ報告、機能要求、プルリクエストを歓迎します。

## 更新履歴

### v1.0.0
- 初回リリース
- 2スイッチTRS入力対応
- USB MIDI出力（CC/PC/Note）
- SysEx設定変更機能
- 不揮発性設定保存
- WebMIDI設定ツール付属
