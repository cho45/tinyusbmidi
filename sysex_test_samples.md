# TinyUSB MIDI Footswitch - SysEx設定サンプル

## SysExプロトコル

### 設定書き込み
F0 00 7D 01 01 <switch> <event> <msgtype> <channel> <param1> <param2> F7

### 設定読み出し要求
F0 00 7D 01 02 F7

### 設定読み出し応答 (デバイスから送信)
F0 00 7D 01 03 <switch> <event> <msgtype> <channel> <param1> <param2> F7

### パラメータ説明
- `<switch>`: 0=Switch1(Tip), 1=Switch2(Ring)
- `<event>`: 0=Press, 1=Release
- `<msgtype>`: 0=None(何もしない), 1=CC, 2=PC, 3=Note
- `<channel>`: MIDI Channel (0-15)
- `<param1>`: CC Number/PC Number/Note Number (0-127)
- `<param2>`: CC Value/Note Velocity (0-127)

## デフォルト設定

| スイッチ | イベント | MIDI | チャンネル | パラメータ1 | パラメータ2 | 説明 |
|----------|----------|------|------------|-------------|-------------|------|
| Switch 1 | Press | CC | 0 | 64 | 127 | Sustain Pedal On |
| Switch 1 | Release | CC | 0 | 64 | 0 | Sustain Pedal Off |
| Switch 2 | Press | PC | 0 | 1 | - | Program Change #1 |
| Switch 2 | Release | PC | 0 | 0 | - | Program Change #0 |

## 設定例

### 1. Switch 1をCC#64 (Sustain Pedal)に設定
```
Press:   F0 00 7D 01 01 00 00 01 00 40 7F F7
Release: F0 00 7D 01 01 00 01 01 00 40 00 F7
```

### 2. Switch 2をProgram Change 0-1に設定 
```
Press:   F0 00 7D 01 01 01 00 02 00 01 00 F7
Release: F0 00 7D 01 01 01 01 02 00 00 00 F7
```

### 3. Switch 1をNote On/Off (C4=60)に設定
```
Press:   F0 00 7D 01 01 00 00 03 00 3C 7F F7
Release: F0 00 7D 01 01 00 01 03 00 3C 00 F7
```

### 4. Switch 2をCC#11 (Expression)に設定
```
Press:   F0 00 7D 01 01 01 00 01 00 0B 7F F7
Release: F0 00 7D 01 01 01 01 01 00 0B 00 F7
```

### 5. Switch 1 Releaseを無効化（何もしない）
```
Release: F0 00 7D 01 01 00 01 00 00 00 00 F7
```

### 6. 設定読み出しテスト
```
要求: F0 00 7D 01 02 F7
```

**期待される応答 (デフォルト設定):**
```
Switch1 Press:   F0 00 7D 01 03 00 00 01 00 40 7F F7
Switch1 Release: F0 00 7D 01 03 00 01 01 00 40 00 F7
Switch2 Press:   F0 00 7D 01 03 01 00 02 00 01 00 F7
Switch2 Release: F0 00 7D 01 03 01 01 02 00 00 00 F7
```

## MIDIツールでのテスト方法

1. Raspberry Pi PicoをPCに接続
2. MIDIモニタープソフトでデバイスを確認
3. **設定読み出しテスト**: `F0 00 7D 01 02 F7` を送信して現在の設定を確認
4. 上記SysExメッセージをMIDI送信ツールで送信して設定変更
5. 再度設定読み出しを行い、変更が反映されていることを確認
6. フットスイッチを操作してMIDIメッセージが送信されることを確認
7. 設定が不揮発性メモリに保存されることを確認（電源再投入後も設定が維持される）

## 期待される動作

1. デフォルト設定でスイッチ操作によるMIDI送信
2. SysEx受信による設定変更
3. 変更された設定での動作確認
4. 電源再投入後の設定保持確認