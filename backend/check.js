// Tes cepat sumber data: node check.js
const countries = require('./src/countries');
const { provider } = require('./src/providers');
(async () => {
  for (const c of countries.slice(0, 4)) {
    const nums = await provider.listNumbers(c).catch(e => (console.log(c.name, 'ERROR', e.message), []));
    console.log(c.name, '→', nums.length, 'nomor', nums[0] ? nums[0].number : '');
    if (nums[0]) { const m = await provider.getMessages(nums[0].href).catch(e => []); console.log('   pesan:', m.length, m[0] ? JSON.stringify(m[0]).slice(0, 120) : ''); }
  }
})();
