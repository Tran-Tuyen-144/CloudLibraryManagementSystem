// Source descriptions can contain HTML. Read text from an inert template and
// return a string, so links/markup never become live elements in book details.
export function bookDescriptionText(value, document = globalThis.document) {
  if (typeof value !== "string" || !value.trim()) return "";
  if (!document) return value.trim();
  const template = document.createElement("template");
  template.innerHTML = value;
  if (!/<\/?[a-z][^>]*>/i.test(value)) {
    return template.content.textContent.replace(/\r\n?/g, "\n").trim();
  }
  template.content
    .querySelectorAll("script, style, template, noscript")
    .forEach((element) => element.remove());

  const blocks = new Set([
    "P",
    "DIV",
    "SECTION",
    "ARTICLE",
    "BLOCKQUOTE",
    "LI",
    "H1",
    "H2",
    "H3",
    "H4",
    "H5",
    "H6",
    "TR",
  ]);
  const parts = [];
  function text(node) {
    if (node.nodeType === 3) {
      parts.push(node.textContent.replace(/\s+/g, " "));
      return;
    }
    if (node.nodeType !== 1 && node.nodeType !== 11) return;
    if (node.nodeName === "BR") {
      parts.push("\n");
      return;
    }
    const block = blocks.has(node.nodeName);
    if (block) parts.push("\n\n");
    for (const child of node.childNodes) text(child);
    if (block) parts.push("\n\n");
  }
  text(template.content);
  return parts
    .join("")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
