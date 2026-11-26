/**
 * Bodies of the attribute-less inline `<script>` blocks the page templates emit.
 * Plain string scanning (no regex), so the result is exact for our own templates.
 */
export function inlineScripts(html: string): string[] {
  const open = "<script>";
  const close = "</script>";
  const out: string[] = [];
  let from = 0;
  for (;;) {
    const start = html.indexOf(open, from);
    if (start < 0) return out;
    const end = html.indexOf(close, start + open.length);
    if (end < 0) throw new Error("unterminated <script> block");
    out.push(html.slice(start + open.length, end));
    from = end + close.length;
  }
}
