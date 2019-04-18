'use strict'

export function deserialize (obj) {
  if (Array.isArray(obj)) return obj.map(deserialize)
  if (obj === null || typeof obj !== 'object') return obj
  if ('$$date$$' in obj) return new Date(obj.$$date$$)
  if ('$$undefined$$' in obj) return undefined
  return Object.entries(obj).reduce(
    (o, [k, v]) => ({ ...o, [k]: deserialize(v) }),
    {}
  )
}

export function serialize (obj) {
  if (Array.isArray(obj)) return obj.map(serialize)
  if (obj === undefined) return { $$undefined$$: true }
  if (obj instanceof Date) return { $$date$$: obj.getTime() }
  if (obj === null || typeof obj !== 'object') return obj
  return Object.entries(obj).reduce(
    (o, [k, v]) => ({ ...o, [k]: serialize(v) }),
    {}
  )
}
