export function el(tag, attributes = {}, ...children) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (name === 'className') node.className = value;
    else if (name.startsWith('on')) node.addEventListener(name.slice(2).toLowerCase(), value);
    else if (name in node && !name.startsWith('aria')) node[name] = value;
    else node.setAttribute(name, value);
  }
  node.append(...children.filter(child => child !== null && child !== undefined));
  return node;
}
