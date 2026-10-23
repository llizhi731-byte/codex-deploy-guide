/* ==========================================================================
   Codex 部署助手 — 交互逻辑（原生 JS，无依赖）
   数据：12 个部署步骤 / 两段一键脚本 / 排错条目
   ========================================================================== */
(function () {
  'use strict';

  var STORE = {
    progress: 'codexGuide.progress',
    open: 'codexGuide.open',
    mirror: 'codexGuide.mirror',
    baseUrl: 'codexGuide.baseUrl',
    theme: 'codexGuide.theme'
  };

  var MIRRORS = {
    tuna:     { host: 'mirrors.tuna.tsinghua.edu.cn', label: '清华 TUNA' },
    ustc:     { host: 'mirrors.ustc.edu.cn',          label: '中科大 USTC' },
    aliyun:   { host: 'mirrors.aliyun.com',           label: '阿里云镜像' },
    official: { host: 'dl-cdn.alpinelinux.org',       label: '官方源' }
  };

  var DEFAULT_BASE_URL = 'https://www.wangshu-api.com/v1';
  var KEY_PLACEHOLDER = 'sk-在这里粘贴你的密钥';

  var state = {
    mirror: 'tuna',
    baseUrl: DEFAULT_BASE_URL,
    apiKey: '',
    done: {},
    open: {}
  };

  /* ---------------- 小工具 ---------------- */

  function read(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (e) { return fallback; }
  }

  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }

  function esc(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  var toastTimer = null;
  function toast(msg) {
    var el = $('#toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 1800);
  }

  function copyText(text) {
    var done = function () { toast('已复制到剪贴板'); };
    var fail = function () { toast('复制失败，请手动选中'); };

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done).catch(function () { legacyCopy(text) ? done() : fail(); });
      return;
    }
    legacyCopy(text) ? done() : fail();
  }

  function legacyCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, ta.value.length);
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) { return false; }
  }

  /* ---------------- 拼装片段 ---------------- */

  function termBlock(title, code) {
    return [
      '<div class="term">',
        '<div class="term-bar">',
          '<span class="tl close"></span><span class="tl min"></span><span class="tl zoom"></span>',
          '<span class="term-name">', esc(title), '</span>',
          '<button type="button" class="btn copy-btn">复制</button>',
        '</div>',
        '<pre><code>', esc(code), '</code></pre>',
      '</div>'
    ].join('');
  }

  function tipList(items) {
    if (!items || !items.length) return '';
    return '<ul class="tips">' + items.map(function (t) { return '<li>' + t + '</li>'; }).join('') + '</ul>';
  }

  function currentHost() { return MIRRORS[state.mirror].host; }
  function currentBase() { return (state.baseUrl || DEFAULT_BASE_URL).trim(); }
  function currentKey() { return (state.apiKey || '').trim() || KEY_PLACEHOLDER; }

  function mirrorCode() {
    if (state.mirror === 'official') {
      return [
        '# 保持官方源，不做替换',
        'cat /etc/apk/repositories',
        'apk update'
      ].join('\n');
    }
    return [
      "sed -i 's#dl-cdn\\.alpinelinux\\.org#" + currentHost() + "#g' /etc/apk/repositories",
      'apk update'
    ].join('\n');
  }

  function configToml() {
    return [
      'mkdir -p ~/.codex',
      "cat > ~/.codex/config.toml <<'EOF'",
      'openai_base_url = "' + currentBase() + '"',
      'openai_api_key = "' + currentKey() + '"',
      'EOF'
    ].join('\n');
  }

  function providerToml() {
    return [
      'model_provider = "relay"',
      '',
      '[model_providers.relay]',
      'name = "relay"',
      'base_url = "' + currentBase() + '"',
      'env_key = "RELAY_API_KEY"',
      '',
      '# 再在 ~/.profile 中导出真实密钥：',
      '# export RELAY_API_KEY="' + currentKey() + '"'
    ].join('\n');
  }

  /* ---------------- 步骤数据 ---------------- */

  function getSteps() {
    return [
      {
        id: 1,
        stage: 'termux',
        title: '更新软件包',
        desc: '先把 Termux 自身的索引和已装包升到最新，避免后面装 proot-distro 时依赖冲突。',
        term: 'termux ~ $',
        code: 'pkg update -y && pkg upgrade -y',
        tips: [
          '出现 <code>Do you want to continue? [Y/n]</code> 直接回车。',
          '卡在 <code>Working...</code> 时可执行 <code>termux-change-repo</code> 换镜像后重试。'
        ]
      },
      {
        id: 2,
        stage: 'termux',
        title: '安装 proot-distro',
        desc: 'proot-distro 用来在 Termux 里跑一个完整的 Linux 发行版，不需要 root。',
        term: 'termux ~ $',
        code: 'pkg install proot-distro -y',
        tips: ['装完可以用 <code>proot-distro list</code> 看支持哪些发行版。']
      },
      {
        id: 3,
        stage: 'termux',
        title: '安装 Alpine 系统',
        desc: '下载并解压 Alpine 的 rootfs，通常几十 MB，第一次装需要等一会儿。',
        term: 'termux ~ $',
        code: 'proot-distro install alpine',
        tips: [
          '下载中断就重跑同一条命令，若提示已存在先 <code>proot-distro remove alpine</code>。',
          '想装特定版本可用 <code>proot-distro install --override-alias alpine320 alpine</code> 之类的别名方式。'
        ]
      },
      {
        id: 4,
        stage: 'termux',
        title: '进入 Alpine 环境',
        desc: '登录后提示符会变成 <code>localhost:~#</code>，之后的命令都在 Alpine 里执行。',
        term: 'termux ~ $',
        code: 'proot-distro login alpine',
        tips: [
          '确认已经在 Alpine 里：<code>cat /etc/os-release</code> 会显示 Alpine Linux。',
          '退出用 <code>exit</code>，下次再进来还是这条 <code>proot-distro login alpine</code>。'
        ]
      },
      {
        id: 5,
        stage: 'alpine',
        title: 'Alpine 更换国内源',
        desc: 'Alpine 的 apk 源默认在境外，换到国内镜像后安装 Node.js 会快很多。',
        term: 'localhost:~ #',
        code: mirrorCode(),
        tips: [
          '当前选择：<b>' + MIRRORS[state.mirror].label + '</b>（<code>' + currentHost() + '</code>），在「开始」页可切换。',
          '换完执行 <code>apk upgrade</code> 把已装的基础包也升一下。'
        ]
      },
      {
        id: 6,
        stage: 'alpine',
        title: '安装 Node.js 与 npm',
        desc: 'Codex CLI 是 npm 包，需要 Node.js 运行时和 npm 包管理器。',
        term: 'localhost:~ #',
        code: 'apk add nodejs npm',
        tips: ['验证：<code>node -v</code> 与 <code>npm -v</code> 都能输出版本号。']
      },
      {
        id: 7,
        stage: 'alpine',
        title: '设置 npm 国内镜像',
        desc: '把 npm registry 指向 npmmirror，装包速度会明显变快。',
        term: 'localhost:~ #',
        code: 'npm config set registry https://registry.npmmirror.com',
        tips: ['检查是否生效：<code>npm config get registry</code>。']
      },
      {
        id: 8,
        stage: 'alpine',
        title: '全局安装 Codex CLI',
        desc: '安装 <code>@openai/codex</code>，可执行文件会落到 <code>/usr/local/bin/codex</code>。',
        term: 'localhost:~ #',
        code: 'npm install -g @openai/codex --registry=https://registry.npmmirror.com',
        tips: [
          '卡住或报网络错误，先确认第 7 步的 registry 是 <code>https://registry.npmmirror.com</code>。',
          '想确认安装位置：<code>npm root -g</code>。'
        ]
      },
      {
        id: 9,
        stage: 'alpine',
        title: '验证安装',
        desc: '能打印出版本号说明 Codex 已经可执行。',
        term: 'localhost:~ #',
        code: 'codex --version',
        tips: [
          '报 <code>codex: command not found</code> 时按「排错」第 2 条处理 PATH。',
          '不改 PATH 也可以直接用 <code>/usr/local/bin/codex --version</code> 试一下。'
        ]
      },
      {
        id: 10,
        stage: 'alpine',
        title: '写入 API 配置',
        desc: '在 Alpine 的 <code>~/.codex/config.toml</code> 里填入中转站地址和密钥。地址与 Key 取自「开始」页输入框。',
        term: 'localhost:~ #',
        code: configToml(),
        tips: [
          'Key 留空时这里展示的是占位符，记得替换成真实 Key。',
          '<code>base_url</code> 一般以 <code>/v1</code> 结尾，结尾不要多加斜杠。',
          '如果上面的写法不生效，可折叠查看官方推荐的 provider 写法。'
        ],
        extra: { term: 'config.toml · provider 写法', code: providerToml() }
      },
      {
        id: 11,
        stage: 'alpine',
        title: '功能测试',
        desc: '发一句问候，能正常返回内容就算跑通了。',
        term: 'localhost:~ #',
        code: 'codex "你好，测试一下"',
        tips: [
          '直接输入 <code>codex</code> 回车会进入交互式界面。',
          '若提示登录/鉴权失败，说明 Key 或 base_url 没生效，回到第 10 步核对。'
        ]
      },
      {
        id: 12,
        stage: 'alpine',
        title: '收尾优化（可选）',
        desc: '把 PATH 固化到 profile，顺手消掉 bubblewrap 的警告。',
        term: 'localhost:~ #',
        code: ["echo 'export PATH=$PATH:/usr/local/bin' >> ~/.profile", 'apk add bubblewrap'].join('\n'),
        tips: [
          '<code>bubblewrap</code> 警告在 proot 环境里属于正常现象，本身可以忽略。',
          '改完 <code>.profile</code> 后 <code>exit</code> 退出再登录才生效。'
        ]
      }
    ];
  }

  /* ---------------- 一键脚本 ---------------- */

  function termuxScript() {
    return [
      '#!/data/data/com.termux/files/usr/bin/sh',
      '# ============================================',
      '# Codex 部署 · ① Termux 端',
      '# 用法：保存为 termux-setup.sh 后 sh termux-setup.sh',
      '# ============================================',
      'set -e',
      '',
      'pkg update -y && pkg upgrade -y',
      'pkg install proot-distro -y',
      'proot-distro install alpine || echo "（已安装 alpine，跳过）"',
      '',
      'echo ""',
      'echo "✅ Alpine 已就绪，下一步手动执行："',
      'echo "   proot-distro login alpine"',
      'echo "   登录后把 ② Alpine 端脚本整段粘贴进去。"'
    ].join('\n');
  }

  function alpineScript() {
    var lines = [
      '#!/bin/sh',
      '# ============================================',
      '# Codex 部署 · ② Alpine 端',
      '# 在 proot-distro login alpine 之后执行',
      '# ============================================',
      'set -e',
      '',
      '# ---- 1. 换源（当前：' + MIRRORS[state.mirror].label + '）----'
    ];

    if (state.mirror === 'official') {
      lines.push('# 使用官方源，跳过替换');
    } else {
      lines.push("sed -i 's#dl-cdn\\.alpinelinux\\.org#" + currentHost() + "#g' /etc/apk/repositories");
    }

    lines = lines.concat([
      'apk update && apk upgrade',
      '',
      '# ---- 2. Node.js / npm / bubblewrap ----',
      'apk add nodejs npm bubblewrap',
      '',
      '# ---- 3. npm 镜像 + 安装 Codex ----',
      'npm config set registry https://registry.npmmirror.com',
      'npm install -g @openai/codex --registry=https://registry.npmmirror.com',
      'codex --version',
      '',
      '# ---- 4. API 配置 ----',
      'mkdir -p ~/.codex',
      "cat > ~/.codex/config.toml <<'EOF'",
      'openai_base_url = "' + currentBase() + '"',
      'openai_api_key = "' + currentKey() + '"',
      'EOF',
      '',
      'echo ""',
      'echo "✅ 部署完成，试运行： codex \\"你好\\""'
    ]);

    return lines.join('\n');
  }

  /* ---------------- 排错数据 ---------------- */

  var FAQ = [
    {
      q: 'Termux 换源之后还是很慢 / 一直 Working…',
      a: [
        '<p>依次试清华、中科大、阿里云镜像：<code>termux-change-repo</code> 里选 <b>Mirrors by region</b> → China。</p>',
        '<p>也可能是 DNS 问题，试 <code>ping mirrors.tuna.tsinghua.edu.cn</code> 看是否通；必要时切到移动数据/其他 Wi-Fi。</p>'
      ].join('')
    },
    {
      q: 'codex: command not found',
      a: [
        '<p>npm 的全局 bin 目录不在 PATH 里。先临时加上：</p>',
        termBlock('localhost:~ #', "export PATH=$PATH:/usr/local/bin\ncodex --version"),
        '<p>确认可用后写进 profile，下次登录自动生效：</p>',
        termBlock('localhost:~ #', "echo 'export PATH=$PATH:/usr/local/bin' >> ~/.profile\n. ~/.profile")
      ].join('')
    },
    {
      q: '请求超时 Request timed out',
      a: [
        '<p>多半是 <code>base_url</code> 写错：必须带 <code>/v1</code>，结尾不要多加斜杠，也不要漏掉 <code>https://</code>。</p>',
        '<p>中转站响应慢时可以把空闲超时调大，在 <code>~/.codex/config.toml</code> 里加一行：</p>',
        termBlock('config.toml', 'stream_idle_timeout_ms = 1800000')
      ].join('')
    },
    {
      q: 'bubblewrap 警告',
      a: [
        '<p>proot 环境里没有 user namespace，这个警告不影响 Codex 主流程，可以直接忽略。</p>',
        '<p>想让它消失：<code>apk add bubblewrap</code>。</p>'
      ].join('')
    },
    {
      q: 'proot-distro install alpine 卡住 / 下载失败',
      a: [
        '<p>先清掉半成品再重装：</p>',
        termBlock('termux ~ $', 'proot-distro remove alpine\nproot-distro install alpine'),
        '<p>Termux 的存储权限和网络状态也要正常：<code>termux-setup-storage</code> 授权一次。</p>'
      ].join('')
    },
    {
      q: '每次都要重新部署吗？',
      a: [
        '<p>不需要。Alpine 和其中的软件都持久化在 Termux 私有目录里，之后只要：</p>',
        termBlock('termux ~ $', 'proot-distro login alpine\ncodex "你好"'),
        '<p>想备份整个环境：<code>proot-distro backup --output ~/alpine.tar.gz alpine</code>。</p>'
      ].join('')
    }
  ];

  /* ---------------- 渲染 ---------------- */

  function renderSteps() {
    var list = $('#stepList');
    if (!list) return;

    list.innerHTML = getSteps().map(function (s) {
      var open = !!state.open[s.id];
      var done = !!state.done[s.id];
      var stageLabel = s.stage === 'termux' ? 'Termux 端' : 'Alpine 端';

      return '<li class="step' + (open ? ' open' : '') + (done ? ' done' : '') + '" data-id="' + s.id + '">'
        + '<div class="step-head" role="button" tabindex="0" aria-expanded="' + open + '">'
          + '<input type="checkbox" class="chk"' + (done ? ' checked' : '') + ' aria-label="标记第 ' + s.id + ' 步完成" />'
          + '<span class="step-idx">' + s.id + '</span>'
          + '<div class="step-title">'
            + '<h4>' + esc(s.title) + '</h4>'
            + '<span class="tag ' + s.stage + '">' + stageLabel + '</span>'
          + '</div>'
          + '<span class="chev">⌄</span>'
        + '</div>'
        + '<div class="step-body">'
          + '<p class="step-desc">' + s.desc + '</p>'
          + termBlock(s.term, s.code)
          + (s.extra ? termBlock(s.extra.term, s.extra.code) : '')
          + tipList(s.tips)
        + '</div>'
      + '</li>';
    }).join('');

    updateProgress();
  }

  function renderScripts() {
    var t = $('[data-panel="termux"]');
    var a = $('[data-panel="alpine"]');
    if (t) t.innerHTML = termBlock('terminal — ① Termux 端', termuxScript());
    if (a) a.innerHTML = termBlock('alpine — ② Alpine 端', alpineScript());
  }

  function renderFaq() {
    var box = $('#accordion');
    if (!box) return;

    box.innerHTML = FAQ.map(function (item) {
      return '<div class="faq-item">'
        + '<button type="button" class="faq-q">' + esc(item.q) + '<span class="chev">⌄</span></button>'
        + '<div class="faq-a">' + item.a + '</div>'
      + '</div>';
    }).join('');
  }

  function updateProgress() {
    var total = getSteps().length;
    var done = 0;
    for (var k in state.done) {
      if (Object.prototype.hasOwnProperty.call(state.done, k) && state.done[k]) done++;
    }
    var pct = total ? Math.round((done / total) * 100) : 0;

    var fill = $('#miniFill');
    if (fill) fill.style.width = pct + '%';

    var label = $('#miniLabel');
    if (label) label.textContent = done + ' / ' + total + ' 已完成' + (done === total ? ' 🎉' : '');

    var badge = $('#stepBadge');
    if (badge) badge.textContent = done + '/' + total;
  }

  function syncMirrorUI() {
    $$('#mirrorChips .seg').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-mirror') === state.mirror);
    });

    var hint = $('#mirrorHint');
    if (!hint) return;
    hint.innerHTML = state.mirror === 'official'
      ? '官方源不做替换，国内访问可能较慢。'
      : '替换为 <code>' + esc(currentHost()) + '</code>，仓库路径 <code>/alpine/vX.Y/</code> 保持不变。';
  }

  function showView(name) {
    $$('.side-item').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-view') === name);
    });
    $$('.view').forEach(function (v) {
      v.classList.toggle('active', v.id === 'view-' + name);
    });

    try { history.replaceState(null, '', '#' + name); } catch (e) {}

    var content = $('#content');
    if (content) content.scrollTop = 0;

    if (name === 'steps') renderSteps();
    if (name === 'scripts') renderScripts();
  }

  function viewFromHash() {
    var name = (location.hash || '').replace(/^#/, '');
    return ['start', 'steps', 'scripts', 'faq', 'cheat'].indexOf(name) >= 0 ? name : '';
  }

  /* ---------------- 行为 ---------------- */

  function debounce(fn, ms) {
    var t = null;
    return function () {
      clearTimeout(t);
      t = setTimeout(fn, ms);
    };
  }

  function download(filename, text) {
    try {
      var blob = new Blob([text], { type: 'text/x-shellscript;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    } catch (err) {
      toast('当前浏览器不支持直接下载');
    }
  }

  function applyTheme(dark) {
    document.body.classList.toggle('dark', !!dark);
    var label = $('#themeLabel');
    if (label) label.textContent = dark ? '浅色' : '深色';
    write(STORE.theme, dark ? 'dark' : 'light');
  }

  function toggleStep(li) {
    if (!li) return;
    var id = li.getAttribute('data-id');
    li.classList.toggle('open');

    var isOpen = li.classList.contains('open');
    if (isOpen) state.open[id] = true; else delete state.open[id];

    var head = li.querySelector('.step-head');
    if (head) head.setAttribute('aria-expanded', String(isOpen));

    write(STORE.open, state.open);
  }

  function bindEvents() {
    document.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;

      var sideItem = t.closest('.side-item');
      if (sideItem) { showView(sideItem.getAttribute('data-view')); return; }

      var goto = t.closest('[data-goto]');
      if (goto) { showView(goto.getAttribute('data-goto')); return; }

      var copyBtn = t.closest('.copy-btn');
      if (copyBtn) {
        var termEl = copyBtn.closest('.term');
        var pre = termEl ? termEl.querySelector('pre') : null;
        if (pre) {
          copyText(pre.textContent);
          copyBtn.textContent = '已复制';
          copyBtn.classList.add('copied');
          setTimeout(function () {
            copyBtn.textContent = '复制';
            copyBtn.classList.remove('copied');
          }, 1400);
        }
        return;
      }

      var mirrorSeg = t.closest('.seg[data-mirror]');
      if (mirrorSeg) {
        state.mirror = mirrorSeg.getAttribute('data-mirror');
        write(STORE.mirror, state.mirror);
        syncMirrorUI();
        renderSteps();
        renderScripts();
        return;
      }

      var tabSeg = t.closest('.seg[data-tab]');
      if (tabSeg) {
        var name = tabSeg.getAttribute('data-tab');
        $$('.seg[data-tab]').forEach(function (b) { b.classList.toggle('active', b === tabSeg); });
        $$('.tabpanel').forEach(function (p) {
          p.classList.toggle('active', p.getAttribute('data-panel') === name);
        });
        return;
      }

      var faqBtn = t.closest('.faq-q');
      if (faqBtn) { faqBtn.parentNode.classList.toggle('open'); return; }

      var head = t.closest('.step-head');
      if (head && !t.closest('.chk')) { toggleStep(head.closest('.step')); return; }
    });

    document.addEventListener('change', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;

      var chk = t.closest('.chk');
      if (chk) {
        var li = chk.closest('.step');
        var id = li.getAttribute('data-id');
        if (chk.checked) state.done[id] = true; else delete state.done[id];
        li.classList.toggle('done', chk.checked);
        write(STORE.progress, state.done);
        updateProgress();

        if (chk.checked) {
          var next = li.nextElementSibling;
          if (next && next.classList.contains('step') && !next.classList.contains('open')) {
            toggleStep(next);
            next.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        }
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var t = e.target;
      if (!t || !t.closest) return;
      var head = t.closest('.step-head');
      if (!head || t.closest('.chk')) return;
      e.preventDefault();
      toggleStep(head.closest('.step'));
    });
  }

  /* ---------------- 控件绑定 ---------------- */

  function bindControls() {
    var themeBtn = $('#themeBtn');
    if (themeBtn) {
      themeBtn.addEventListener('click', function () {
        applyTheme(!document.body.classList.contains('dark'));
      });
    }

    var toggleKeyBtn = $('#toggleKey');
    var keyInput = $('#apiKey');
    if (toggleKeyBtn && keyInput) {
      toggleKeyBtn.addEventListener('click', function () {
        var show = keyInput.type === 'password';
        keyInput.type = show ? 'text' : 'password';
        toggleKeyBtn.textContent = show ? '隐藏' : '显示';
      });
    }

    var baseInput = $('#baseUrl');
    if (baseInput) {
      baseInput.addEventListener('input', debounce(function () {
        state.baseUrl = baseInput.value.trim();
        write(STORE.baseUrl, state.baseUrl);
        renderSteps();
        renderScripts();
      }, 160));
    }

    if (keyInput) {
      keyInput.addEventListener('input', debounce(function () {
        state.apiKey = keyInput.value.trim();
        renderSteps();
        renderScripts();
      }, 160));
    }

    var resetBtn = $('#resetBtn');
    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        state.done = {};
        write(STORE.progress, state.done);
        renderSteps();
        toast('进度已重置');
      });
    }

    var expandAll = $('#expandAll');
    if (expandAll) {
      expandAll.addEventListener('click', function () {
        getSteps().forEach(function (s) { state.open[s.id] = true; });
        write(STORE.open, state.open);
        renderSteps();
      });
    }

    var collapseAll = $('#collapseAll');
    if (collapseAll) {
      collapseAll.addEventListener('click', function () {
        state.open = {};
        write(STORE.open, state.open);
        renderSteps();
      });
    }

    var downloadBoth = $('#downloadBoth');
    if (downloadBoth) {
      downloadBoth.addEventListener('click', function () {
        download('termux-setup.sh', termuxScript());
        setTimeout(function () { download('alpine-setup.sh', alpineScript()); }, 450);
        toast('脚本已开始下载');
      });
    }
  }

  /* ---------------- 启动 ---------------- */

  function init() {
    var savedMirror = read(STORE.mirror, 'tuna');
    state.mirror = MIRRORS[savedMirror] ? savedMirror : 'tuna';

    state.baseUrl = read(STORE.baseUrl, DEFAULT_BASE_URL) || DEFAULT_BASE_URL;
    state.done = read(STORE.progress, {}) || {};
    state.open = read(STORE.open, { 1: true }) || {};

    var baseInput = $('#baseUrl');
    if (baseInput) baseInput.value = state.baseUrl;

    syncMirrorUI();
    renderSteps();
    renderScripts();
    renderFaq();
    applyTheme(read(STORE.theme, 'light') === 'dark');
    bindEvents();
    bindControls();
    showView(viewFromHash() || 'start');

    window.addEventListener('hashchange', function () {
      var name = viewFromHash();
      if (name) showView(name);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }






})();
