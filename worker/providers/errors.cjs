function providerError(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}
module.exports = { providerError };
