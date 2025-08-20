# TinyUSB MIDI Footswitch

Raspberry Pi Picoを使用したUSB MIDIフットスイッチデバイス

## すぐに使う

### 必要なもの

- **Raspberry Pi Pico** × 1
- **3.5mm TRSジャック対応フットスイッチ** × 1-2（またはTRSジャック + 個別スイッチ）

### ファームウェア書き込み

1. [GitHub Releases](https://github.com/cho45/tinyusbmidi/releases) から最新の `tinyusbmidi.uf2` をダウンロード
2. **BOOTSELボタン**を押しながらPicoをUSB接続
3. 表示された `RPI-RP2` ドライブに `.uf2` ファイルをコピー

### スイッチの配線

![配線図]( ./doc/tinymidi.drawio.png )

```
TRSジャック（3.5mm ステレオ）
┌─ TIP ────→ GP2 (Switch 1)
├─ RING ───→ GP3 (Switch 2)
└─ SLEEVE ─→ GND
```

```
Raspberry Pi Pico配線
GP2  ●────── TIP (Switch 1)
GP3  ●────── RING (Switch 2)  
GND  ●────── SLEEVE (GND)
```

内部プルアップを利用しているので追加のパーツは不要です。

### 設定変更

[オンライン設定ツール](https://cho45.github.io/tinyusbmidi/) でMIDIメッセージをカスタマイズできます。

## 開発者向け

### ビルド環境

**簡単：** VSCode + Raspberry Pi Pico拡張機能を使うと環境構築が簡単です

**手動：** Pico SDK、CMake、ARM GCCが必要

```bash
# ビルド手順
mkdir build && cd build
cmake .. -G Ninja
ninja
```

### プロジェクト構成

```
├── tinyusbmidi.c           # メイン実装
├── usb_descriptors.c       # USB MIDI記述子
├── tusb_config.h           # TinyUSB設定
├── CMakeLists.txt          # ビルド設定
└── config-app/             # WebMIDI設定ツール（ローカル版）
    ├── index.html
    ├── app.js
    └── midi-manager.js
```

### 技術仕様

#### ハードウェア
- **MCU**: RP2040
- **GPIO**: GP2(TIP), GP3(RING) - 内部プルアップ有効
- **デバウンス**: 20ms

#### MIDI機能
- **デバイス名**: TinyUSB MIDI Footswitch
- **対応メッセージ**: CC、PC、Note On/Off
- **設定保存**: フラッシュメモリ（256KB offset）

#### SysExプロトコル

**設定書き込み**
```
F0 00 7D 01 01 <switch> <event> <msgtype> <channel> <param1> <param2> F7
```

**設定読み出し要求**
```
F0 00 7D 01 02 F7
```

**設定読み出し応答**
```
F0 00 7D 01 03 <switch> <event> <msgtype> <channel> <param1> <param2> F7
```

**パラメータ**
- `switch`: 0=Switch1(Tip), 1=Switch2(Ring)
- `event`: 0=Press, 1=Release  
- `msgtype`: 0=None, 1=CC, 2=PC, 3=Note
- `channel`: MIDI Channel (0-15)
- `param1`: CC Number/PC Number/Note Number (0-127)
- `param2`: CC Value/Note Velocity (0-127)

**設定例**

Sustain Pedal:
```
Press:   F0 00 7D 01 01 00 00 01 00 40 7F F7
Release: F0 00 7D 01 01 00 01 01 00 40 00 F7
```

Program Change:
```
Press:   F0 00 7D 01 01 01 00 02 00 01 00 F7
Release: F0 00 7D 01 01 01 01 02 00 00 00 F7
```

Note On/Off:
```
Press:   F0 00 7D 01 01 00 00 03 00 3C 7F F7
Release: F0 00 7D 01 01 00 01 03 00 3C 00 F7
```

スイッチ無効化:
```
Release: F0 00 7D 01 01 00 01 00 00 00 00 F7
```

設定読み出し:
```
要求: F0 00 7D 01 02 F7
```

### デバッグ

**シリアル出力**
```bash
# GP0(TX), GP1(RX) - 115200 baud
# picotoolでの書き込み
picotool load tinyusbmidi.uf2
picotool reboot
```

**SysExテスト手順**
1. MIDIモニタープログラムでデバイス確認
2. `F0 00 7D 01 02 F7` を送信して現在設定を読み出し
3. 上記設定例のSysExメッセージで設定変更
4. 再度設定読み出しで変更確認
5. フットスイッチ操作でMIDIメッセージ送信確認
6. 電源再投入後の設定保持確認

### トラブルシューティング

**デバイスが認識されない**
- ファームウェアの書き込み確認
- USBケーブル・ポート確認

**スイッチが反応しない**
- TRSジャック配線確認
- スイッチの導通確認（テスター使用）

**設定が保存されない**
- SysExフォーマット確認
- 電源再投入で動作確認
