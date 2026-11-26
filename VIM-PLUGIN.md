# spider-paint as a Vim plugin

A step-by-step guide for someone who knows neither Vim nor spider-paint, on an Ubuntu machine that already has Vim.

Do everything in a Terminal window (Ctrl+Alt+T). Paste the lines one at a time and press Enter after each. A `sudo`
command asks for the computer's password.

## 1. A full Vim

Ubuntu often ships only a cut-down Vim. The plugin needs one with a built-in terminal:

```sh
sudo apt update
sudo apt install -y vim git curl
vim --version | grep -o '+terminal'
```

If the last command prints `+terminal`, you are set. If it prints nothing: `sudo apt install -y vim-gtk3`.

## 2. Node 22 or newer

Ubuntu's own Node is too old for this. Install a current one with nvm:

```sh
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/master/install.sh | bash
source ~/.bashrc
nvm install 24
node --version
```

The last line should print `v24…`.

## 3. Google Chrome

The real spider-paint app runs in it, hidden in the background:

```sh
cd ~
wget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
sudo apt install -y ./google-chrome-stable_current_amd64.deb
```

## 4. spider-paint and the plugin

Vim's own package system is enough; no plugin manager is needed:

```sh
git clone https://github.com/Pengeszikra/spider-paint.git ~/Spider-Paint
mkdir -p ~/.vim/pack/spider/start
ln -s ~/Spider-Paint/vim ~/.vim/pack/spider/start/spider-paint
printf 'set termguicolors\nset mouse=a\n' >> ~/.vimrc
```

- `git clone` downloads the program.
- `ln -s` plugs the plugin into Vim.
- The last line turns on the colours and the mouse.

## 5. Try it

```sh
vim
```

Inside Vim, type this (with the colon):

```
:SpiderPaint bridge
```

The 3D scene with the bridge opens on the right.

## What a Vim beginner needs to know

| To do this | Press |
|---|---|
| Fly and build in the 3D view | Click into the right side; from then on every key belongs to spider-paint (W A S D, T, Enter, `?` for the help) |
| Leave spider-paint | Enter, `/q`, Enter (or Ctrl+C) |
| Go to the other window | Ctrl+W, then `w` |
| Leave Vim altogether | `:qa!` and Enter |
| Watch a scene file live | `vim ~/Spider-Paint/models/bridge.scene.json`, then `:SpiderPaint`; every save (`:w`) updates the 3D view |

## Updating

```sh
cd ~/Spider-Paint && git pull
```

## If something is off

- **A simpler picture with outlines instead of the real app:** Chrome or Node 22 is missing. After you quit, the
  terminal prints which one.
- **Odd characters when you move the mouse after a crash:** type `reset` and press Enter (even if you cannot see what
  you type).
- **No colours:** check that `~/.vimrc` has `set termguicolors`. Ubuntu's own Terminal shows the colours and passes the
  mouse on.

- **Slow, the picture lags:** Vim's built-in terminal reads every colour code itself, so it is much slower than
  the terminal around it; the bigger the split, the more there is to read. spider-paint already sends only the
  cells that changed, rounds the colours a little and makes at most 10 frames a second inside Vim. What helps more:
  - a smaller split (`let g:spider_paint_split = 'horizontal'` and a few lines less, or `:resize 30`);
  - Neovim: its terminal is faster (`nvim`, then `:SpiderPaint`);
  - fewer frames or rounder colours, in `~/.vimrc`: `let $SPIDER_TERM_FPS = 6` (1–30) and
    `let $SPIDER_TERM_QUANT = 4` (0–5: how many low bits of each colour are dropped);
  - on a Mac, a terminal that is fast with true colour (iTerm2, kitty, WezTerm, Ghostty) around Vim, rather than
    Apple's Terminal.
  The fastest is spider-paint in a terminal of its own: `npm run term` (or `spider-term`) in another tab.

## Options

| Setting (in `~/.vimrc`) | What it does |
|---|---|
| `let g:spider_paint_split = 'horizontal'` | open spider-paint below instead of beside (`'vertical'` is the default, `'tab'` a tab of its own) |
| `let g:spider_paint_cmd = ['node', '/path/to/Spider-Paint/bin/spider-term.mjs']` | run another checkout |
| `let $SPIDER_TERM_FPS = 6` | at most this many frames a second (default 10 inside Vim / Neovim, 14 elsewhere) |
| `let $SPIDER_TERM_QUANT = 4` | colours rounded: this many low bits of each channel dropped (default 3 inside Vim / Neovim, 0 elsewhere) |

The plugin works in Neovim too (Vim 8.1+ or Neovim). In Neovim, Ctrl+\ then Ctrl+N gets back to the editor.

## Quick reference (for those who know Vim)

The checkout is a Vim plugin too (`vim/plugin/spider-paint.vim`):

```vim
" vim-plug (lazy.nvim: { 'Pengeszikra/spider-paint', config = function(p) vim.opt.rtp:append(p.dir .. '/vim') end })
Plug 'Pengeszikra/spider-paint', { 'rtp': 'vim', 'do': 'npm install --omit=dev' }
set termguicolors mouse=a
```

`:SpiderPaint` opens spider-paint in a vertical terminal split: the buffer's scene file if it is one (saving it reloads the
view), else the start scene; `:SpiderPaint bridge` a scene of the + scene list; `:SpiderPaint path.json` a file.
`g:spider_paint_split` = `'vertical'` | `'horizontal'` | `'tab'`. In the split every key belongs to spider-paint; Ctrl+W
(Vim) or Ctrl+\ Ctrl+N (Neovim) gets back to the editor, Ctrl+C quits spider-paint. Vim 8.1+ or Neovim, node 22+.
