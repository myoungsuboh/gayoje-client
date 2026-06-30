export const getNodeProp = (node, key, fallback = '') => node?.[key] ?? node?.properties?.[key] ?? fallback
