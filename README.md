# session-bar

A small Claude-orange bar above the prompt in Claude Code that shows:

- **Where the session is**: the last three folders of its working directory (`Projects / my-app / src`). Click it to open that folder in your file manager. In the Claude desktop app, the app asks you to approve each open on Windows.
- **How far along the current turn is**: while Claude works, a thin orange bar shimmers under the path. When Claude keeps a task list, the bar fills step by step and shows a count like `2/5`; without one, it shimmers to say work is in progress.

It draws on the desktop app's Code tab and in the terminal (where the bar is drawn as `▰▰▰▱▱▱`).

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install session-bar --marketplace iricky92-crypto/session-bar
```

Answer `y` to add the marketplace, then pick a scope (user scope puts the bar in every session).

From a shell:

```bash
claude plugin install session-bar --marketplace iricky92-crypto/session-bar
```

New sessions pick it up. Installed from a terminal at user scope, it also shows in the desktop app's Code tab.

## Uninstall

```bash
claude plugin uninstall session-bar
```

## Development

```bash
claude plugin validate .
claude plugin test .
```
