# dsh-chime

浠诲姟瀹屾垚鎻愮ず闊虫彃浠?for [DeepSeek Harness](https://github.com/deepseek-ai/DeepSeek-Harness) Web GUI锛坉sh-web-ui 鎻掍欢鐢熸€侊級銆?
褰撳墠浼氳瘽鐨?agent 浠诲姟缁撴潫鏃舵挱鏀炬彁绀洪煶锛堝彯鍜氾級锛屾敮鎸侀煶閲忚皟鑺傘€侀潤闊炽€佹洿鎹㈠唴缃煶鏁堛€佷笂浼犺嚜瀹氫箟闊抽鏂囦欢锛岃缃〉浣嶄簬銆岃缃?鈫?鎻掍欢 鈫?浠诲姟瀹屾垚鎻愮ず闊炽€嶏紝鍙﹀甫涓€涓偓娴煶閲忔帶浠躲€?
## Features

- 馃敂 **浠诲姟瀹屾垚鎻愮ず闊?*锛氱洃鍚綋鍓嶄細璇?`running 鈫?idle` 璺冲彉锛屼换鍔＄粨鏉熺灛闂村搷閾冿紙鍒囨崲浼氳瘽 / 椤甸潰鍔犺浇涓嶈鍝嶏級
- 馃帤锔?**鎮诞闊抽噺鎺т欢**锛堝乏涓嬭锛夛細闈欓煶寮€鍏炽€侀煶閲忔粦鍧椼€佽瘯鍚寜閽紝鏀瑰姩鍗虫寔涔呭寲
- 馃幍 **澶氱闊虫晥**锛氬唴缃€岀粡鍏稿彯鍜?/ 鏌斿拰闂ㄩ搩 / 娓呰剢鎻愮ず / 涓夎繛闊炽€嶏紙Web Audio 瀹炴椂鍚堟垚锛屾棤闊抽鏂囦欢渚濊禆锛?- 馃搧 **鑷畾涔夐煶棰?*锛氫笂浼犳湰鍦伴煶棰戞枃浠讹紙mp3 / wav / ogg / m4a / aac / flac / webm锛屸墹16MB锛夛紝淇濆瓨鍒?`~/.dsh/chime/audio/`锛屽彲璇曞惉銆佸彲鍒犻櫎
- 鈿欙笍 **璁剧疆椤?*锛氭敞鍐屽湪銆岃缃?鈫?鎻掍欢銆嶏紝闊抽噺 / 闈欓煶 / 闊虫晥閫夋嫨 / 涓婁紶绠＄悊鍏ㄩ儴鍥惧舰鍖?- 馃捑 **闆惰繍琛屾椂渚濊禆**锛歨ost 鍗婁綋绾?Node 鍐呯疆妯″潡锛屾祻瑙堝櫒鍗婁綋绾?React锛屾棤闇€鏋勫缓锛坄lib/` 鍗冲彂甯冧骇鐗╋級

## Install

```bash
# 瀹夎鍒?web profile锛坉sh 鎻掍欢甯傚満 / dsh CLI锛?dsh plugin --profile web add github:Mystery-God/dsh-chime
# 鎴栫洿鎺ユ敼 profile 鐨?package.json / bundles 鍚?pnpm install
```

瀹夎鍚庨噸鍚?dsh web锛屽嵆鍙湪銆岃缃?鈫?鎻掍欢 鈫?浠诲姟瀹屾垚鎻愮ず闊炽€嶄腑閰嶇疆銆?
## How it works

```
lib/index.js   鈥?host 鍗婁綋锛殈/.dsh/chime/settings.json 瀛樺偍 + /api/dsh-chime/* 璺敱锛堣缃鍐欍€侀煶棰戜笂浼?鎾斁/鍒犻櫎锛? agent 鍏憡
lib/client.js  鈥?娴忚鍣ㄥ崐浣擄細璁剧疆椤碉紙settings.plugins.tab锛? 鎮诞鎺т欢锛坰hell.overlay锛? 瀹屾垚鐩戝惉锛坲seSessions 鏍囧噯 props锛?cordis.patch.yml 鈥?bundle patch锛氭妸鎻掍欢琛屾敞鍏?profile 缁勫悎
```

- 璺敱甯?loopback + same-origin 鍥存爮锛堜笌 dsh-ssh 涓€鑷达級锛孡AN 鏆撮湶鐨勯儴缃蹭笉浼氬澶栨彁渚涜繖浜涙帴鍙?- 闊抽噺/闈欓煶/闊虫晥閫夋嫨鍗虫椂 PUT 鍒?host 鎸佷箙鍖栵紱娴忚鍣ㄥ唴瀛樹腑鍏变韩涓€浠?store锛岃缃〉涓庢偓娴潯瀹炴椂鍚屾

## Development

```bash
node scripts/build.mjs   # 鎶?src/ 澶嶅埗涓?lib/锛堟棤缂栬瘧姝ラ锛?```

鏈粨搴撴棤 TypeScript / 鏃犳墦鍖呭櫒锛歚src/` 鏄墜鍐欐簮鐮侊紝`lib/` 鏄彂甯冧骇鐗╋紙闇€鎻愪氦锛宒sh 鎻掍欢甯傚満鏍￠獙瀹夎鍖呮椂瑕佹眰鍏ュ彛鏂囦欢瀛樺湪锛夈€?
## License

[MIT](./LICENSE)

