# 扎金花（单机版）

一个纯前端、单机的扎金花小游戏：和 AI 对手同桌，用虚拟筹码玩。无需后端，打开 `index.html` 即可运行。

> **仅供个人娱乐。** 游戏内筹码为虚拟数值，没有任何现实价值，不能充值、兑换或交易。
> 禁止将本项目用于任何形式的赌博、真钱游戏或商业运营。

## 运行

直接用浏览器打开 `index.html`，或在项目目录启动任意静态服务器：

```bash
npx serve .
# 或
python3 -m http.server 8080
```

## 玩法与设置

- 四个场次：新手场 / 平民场 / 高手场 / 富豪场，筹码达到门槛才能进入
- 初始筹码 **5,000**；筹码低于 200 时可领取救济金，每次 **2,000**，每天最多 3 次
- 可选设置：235 吃豹子、最大轮数、结算亮所有牌、AI 难度、出牌速度、操作计时、音效与语音播报
- **🍀 好运模式**：开启后，每局有 **25%** 的概率把全桌最大的一手牌换给你
- 存档保存在浏览器 `localStorage`，可在大厅「重置存档」

## 目录

```
index.html      页面结构
css/style.css   样式
js/rules.js     牌型判定与比牌
js/ai.js        AI 决策
js/game.js      牌局流程（发牌、下注、比牌、结算）
js/ui.js        通用 UI（弹窗、提示、动画）
js/audio.js     音效与语音播报（Web Audio / SpeechSynthesis）
js/main.js      大厅、存档、设置
assets/         扑克牌与头像素材
```

## 许可证

本项目代码采用 [PolyForm Noncommercial License 1.0.0](./LICENSE)：

- ✅ 允许：个人学习、研究、娱乐、修改，以及非商业性的分享
- ❌ 禁止：任何商业用途，包括但不限于售卖、商业运营、嵌入收费产品、接入广告或充值

注意：这是一种「源码公开」许可证，不属于 OSI 定义的开源许可证。

## 第三方素材

以下素材**不受**上述许可证约束，遵循其各自的原始许可：

| 素材 | 来源 | 作者 | 许可 |
| --- | --- | --- | --- |
| 扑克牌图片 `assets/cards/` | [Vector Playing Cards](https://code.google.com/archive/p/vector-playing-cards/) | Byron Knoll | 公有领域（Public Domain） |
| 头像 `assets/avatars/` | [DiceBear Adventurer](https://www.dicebear.com/styles/adventurer/)（[Figma 原稿](https://www.figma.com/community/file/1184595184137881796)） | Lisa Wischofsky | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |

字体「马善政楷书」通过 Google Fonts 在线加载（SIL Open Font License），未包含在仓库中。

## 免责声明

本项目仅为技术学习与个人娱乐用途编写，不提供任何形式的真钱交易、充值或兑换功能。
任何人将本项目用于赌博或其他违法用途，责任由使用者自行承担，与作者无关。
