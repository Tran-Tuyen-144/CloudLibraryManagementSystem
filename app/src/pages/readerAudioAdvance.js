// Auto-advance only in modes with an unambiguous current reading unit.
export function nextAudioUnit(position, total, turning) {
  if (
    turning === "scroll" ||
    !Number.isInteger(position) ||
    !Number.isInteger(total) ||
    position < 1 ||
    position >= total
  )
    return null;
  return position + 1;
}

export function isAudioTarget(request, bookId, mode, turning, position) {
  return Boolean(
    request &&
    turning !== "scroll" &&
    request.bookId === bookId &&
    request.mode === mode &&
    request.turning === turning &&
    request.position === position,
  );
}
