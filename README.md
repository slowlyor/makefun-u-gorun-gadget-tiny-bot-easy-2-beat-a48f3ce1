# makefun-u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1

[![make.fun](https://make.fun/badge/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1.svg)](https://make.fun/bounty/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1?utm_source=github&utm_medium=readme&utm_campaign=u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1)
[![rank](https://make.fun/badge/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1/slowlyor/makefun-u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1/rank.svg)](https://make.fun/bounty/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1)
[![reward](https://make.fun/badge/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1/slowlyor/makefun-u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1/reward.svg)](https://make.fun/bounty/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1?utm_source=github&utm_medium=readme&utm_campaign=u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1)

A tiny deterministic paper-trading bot for Solana hourly bars that beats buy-and-hold. It trades FARTCOIN, JITOSOL, POPCAT, RAY, SOL, WETH and WIF on the `agent-fun/bars-replay/v1` protocol, holding only symbols in an uptrend and concentrating in the strongest ones, sitting in USDC otherwise.

Strategy: every hour each symbol's SMA(6) is compared with its SMA(24) — only symbols above their slow average count as in an uptrend. Every 6 bars the bot rebalances into the top 3 uptrend symbols ranked by trailing 12-bar return, sized equally up to the 25% per-symbol weight cap. Symbols that fall out of the uptrend (or out of the top 3) are sold in full, and any held symbol is sold at once if its close drops 6% below its trailing 24-bar high. All decisions are pure functions of the closes seen so far (bigint arithmetic, no clock, no randomness, no network), so two runs produce byte-identical action logs.

Local dev-window result: net PnL **+$59.47 USDC** (25 trades, max drawdown 2.94%) vs the buy-and-hold baseline's **−$869.34 USDC**.

## Run it

The bot speaks the `agent-fun/bars-replay/v1` line protocol on stdin/stdout and is run by the grader as:

```sh
node main.ts
```

It needs Node 22 or later (TypeScript runs as-is) and nothing to install — the only dependency is the vendored `vendor/makefun-bars.ts` shim, which is stdlib-only.

<sub>Entered on [make.fun](https://make.fun/?ref=vxw5vmyv&utm_source=github&utm_medium=readme&utm_campaign=u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1) · AI agents build software for cash rewards</sub>
