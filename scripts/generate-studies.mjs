import { mkdir, writeFile } from "node:fs/promises";
await mkdir("public/studies", { recursive: true });
const titles = ["午后练习曲", "四拍之间", "第一段分解"];
for (let k = 0; k < 3; k++) {
  const chordNames =
    k === 0
      ? ["C", "Am", "Fmaj7", "G"]
      : k === 1
        ? ["C", "Am", "Dm", "G"]
        : ["Em", "C", "G", "D"];
  const shapes =
    k === 0
      ? [
          [-1, 3, 2, 0, 1, 0],
          [-1, 0, 2, 2, 1, 0],
          [-1, -1, 3, 2, 1, 0],
          [3, 2, 0, 0, 3, 3],
        ]
      : k === 1
        ? [
            [-1, 3, 2, 0, 1, 0],
            [-1, 0, 2, 2, 1, 0],
            [-1, -1, 0, 2, 3, 1],
            [3, 2, 0, 0, 3, 3],
          ]
        : [
            [0, 2, 2, 0, 0, 0],
            [-1, 3, 2, 0, 1, 0],
            [3, 2, 0, 0, 3, 3],
            [-1, -1, 0, 2, 3, 2],
          ];
  let s =
    '<svg xmlns="http://www.w3.org/2000/svg" width="840" height="1188" viewBox="0 0 840 1188"><rect width="840" height="1188" fill="#fffdf8"/><g fill="#39382f" font-family="Microsoft YaHei, sans-serif"><text x="65" y="65" font-size="13" letter-spacing="3" fill="#b45b40">弦间 / ORIGINAL STUDY 0' +
    (k + 1) +
    '</text><text x="65" y="136" font-size="37" font-family="SimSun,serif">' +
    titles[k] +
    '</text><text x="65" y="174" font-size="15" fill="#8b8576">原创练习谱 · 标准调弦 · Capo 0 · 四分音符 = 72</text><path d="M65 202H775" stroke="#d9d2c3"/>';
  chordNames.forEach((name, j) => {
    s +=
      '<text x="' +
      (107 + j * 175) +
      '" y="237" font-size="19">' +
      name +
      "</text>";
    for (let i = 0; i < 6; i++)
      s +=
        '<path d="M' + (83 + j * 175 + i * 13) + ' 257v64" stroke="#7a7365"/>';
    for (let f = 0; f < 5; f++)
      s +=
        '<path d="M' +
        (83 + j * 175) +
        " " +
        (257 + f * 16) +
        'h65" stroke="#7a7365"/>';
    shapes[j].forEach((f, i) => {
      s +=
        f > 0
          ? '<circle cx="' +
            (83 + j * 175 + i * 13) +
            '" cy="' +
            (249 + f * 16) +
            '" r="4.8" fill="#b45b40"/>'
          : '<text x="' +
            (79 + j * 175 + i * 13) +
            '" y="252" font-size="10">' +
            (f < 0 ? "×" : "○") +
            "</text>";
    });
  });
  for (let row = 0; row < 4; row++) {
    const y = 395 + row * 151;
    s +=
      '<text x="65" y="' +
      (y - 28) +
      '" font-size="12" fill="#9a907d">' +
      (row < 2 ? "A · 分解练习" : "B · 反复巩固") +
      " / 第 " +
      (row * 4 + 1) +
      "–" +
      (row * 4 + 4) +
      " 小节</text>";
    for (let i = 0; i < 6; i++) {
      s +=
        '<path d="M70 ' +
        (y + i * 11) +
        'H770" stroke="#ada797" stroke-width=".8"/>';
      if (row === 0)
        s +=
          '<text x="52" y="' +
          (y + i * 11 + 4) +
          '" font-size="10">' +
          (i + 1) +
          "</text>";
    }
    for (let bar = 0; bar < 4; bar++) {
      const x = 70 + bar * 175;
      s +=
        '<path d="M' +
        x +
        " " +
        y +
        'v55" stroke="#777264"/><text x="' +
        (x + 7) +
        '" y="' +
        (y - 9) +
        '" font-size="15" font-weight="bold">' +
        chordNames[bar] +
        "</text>";
      const picking = [1, 3, 2, 3, 4, 3, 2, 3];
      for (let n = 0; n < 8; n++) {
        let si = picking[(n + k) % 8];
        if (shapes[bar][si] < 0) si = 2;
        s +=
          '<text x="' +
          (x + 12 + n * 20) +
          '" y="' +
          (y + (5 - si) * 11 + 4) +
          '" text-anchor="middle" font-size="13" stroke="#fffdf8" stroke-width="5" paint-order="stroke">' +
          shapes[bar][si] +
          '</text><text x="' +
          (x + 12 + n * 20) +
          '" y="' +
          (y + 76) +
          '" text-anchor="middle" font-size="10" fill="#948b77">' +
          (n % 2 === 0 ? n / 2 + 1 : "&amp;") +
          "</text>";
      }
    }
    s += '<path d="M770 ' + y + 'v55" stroke="#777264"/>';
  }
  s +=
    '<path d="M65 1009H775" stroke="#d9d2c3"/><text x="65" y="1046" font-size="15" fill="#a45037">练习手记</text><text x="65" y="1079" font-size="14">先慢速弹清楚每个音，再尝试让四个和弦连贯起来。</text><text x="65" y="1108" font-size="14">' +
    (k === 2
      ? "Em → C：先比较指型，再慢慢练习落指顺序。"
      : "C → Am：对照指型，观察可以保留的手指位置。") +
    '</text><text x="65" y="1158" font-size="11" fill="#aaa18e">弦间原创 · 可自由用于个人练习 / 八分音符按 1 &amp; 2 &amp; 3 &amp; 4 &amp; 计数</text></g></svg>';
  await writeFile("public/studies/study-" + k + ".svg", s);
}
