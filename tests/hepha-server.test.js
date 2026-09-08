const assert = require("node:assert/strict");
const test = require("node:test");

const {
  inlineMarkdown,
  markdownToHtml,
  normalizeLink,
} = require("../skills/hepha/scripts/hepha-server");

test("normalizeLink blocks executable and data protocols", () => {
  assert.equal(normalizeLink("javascript:alert(1)"), "#blocked-link");
  assert.equal(normalizeLink("data:text/html;base64,abc"), "#blocked-link");
  assert.equal(normalizeLink("https://example.com/docs"), "https://example.com/docs");
  assert.equal(normalizeLink("./relative.md"), "./relative.md");
});

test("inlineMarkdown renders safe links without scriptable URLs", () => {
  const html = inlineMarkdown("[bad](javascript:alert(1)) [ok](https://example.com)");
  assert.doesNotMatch(html, /href=\"javascript:/);
  assert.match(html, /href=\"#blocked-link\"/);
  assert.match(html, /href=\"https:\/\/example.com\"/);
});

test("markdownToHtml renders wiki metadata and common markdown safely", () => {
  const html = markdownToHtml("## 用法\n\n1. 先写测试\n2. 再写实现\n\n> 可复用结论");
  assert.match(html, /<ol>/);
  assert.match(html, /<blockquote>/);
});
