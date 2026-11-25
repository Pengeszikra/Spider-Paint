" spider-paint in Vim / Neovim: the 3D workshop in a terminal split (bin/spider-term.mjs: the real app in a headless
" Chrome, every key works; without Chrome the terminal's own viewer).
"
"   :SpiderPaint            the buffer's scene file (.json / .3draft) if it is one, else the app's start scene
"   :SpiderPaint bridge     a scene of the + scene list (bridge, globe, deepsky, human…)
"   :SpiderPaint path.json  a scene file; saving it again reloads the view
"
" Options: g:spider_paint_split ('vertical' | 'horizontal' | 'tab', default 'vertical'),
"          g:spider_paint_cmd   (the command as a list, default: ['node', this checkout's bin/spider-term.mjs])
" In the split every key goes to spider-paint; leave it with Ctrl+W (Vim) or Ctrl+\ Ctrl+N (Neovim). Ctrl+C quits.
" For the colours: a true-colour terminal and `set termguicolors`; for the mouse: `set mouse=a`.
if exists('g:loaded_spider_paint') | finish | endif
let g:loaded_spider_paint = 1

let s:root = fnamemodify(resolve(expand('<sfile>:p')), ':h:h:h')

function! s:Cmd(arg) abort
  " a list: no shell between (paths with spaces stay whole)
  let l:base = get(g:, 'spider_paint_cmd', ['node', s:root . '/bin/spider-term.mjs'])
  let l:base = type(l:base) == v:t_list ? copy(l:base) : split(l:base)
  let l:what = a:arg
  if empty(l:what) && expand('%:e') =~? '^\(json\|3draft\)$'
    let l:what = expand('%:p')
  endif
  return empty(l:what) ? l:base : l:base + [l:what]
endfunction

function! s:Open(arg) abort
  if !has('nvim') && !has('terminal')
    echoerr 'spider-paint: this Vim has no :terminal (Vim 8.1+ or Neovim)'
    return
  endif
  let l:cmd = s:Cmd(a:arg)
  let l:split = get(g:, 'spider_paint_split', 'vertical')
  if has('nvim')
    execute l:split ==# 'tab' ? 'tabnew' : l:split ==# 'horizontal' ? 'new' : 'vnew'
    call termopen(l:cmd, {'on_exit': {-> execute('silent! bdelete!')}})
    setlocal nonumber norelativenumber signcolumn=no
    startinsert
  else
    if l:split ==# 'tab'
      tabnew
      call term_start(l:cmd, {'curwin': 1, 'term_finish': 'close'})
    else
      call term_start(l:cmd, {'vertical': l:split !=# 'horizontal', 'term_finish': 'close'})
    endif
  endif
endfunction

command! -nargs=? -complete=file SpiderPaint call s:Open(<q-args>)
