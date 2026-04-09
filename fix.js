const fs = require('fs');
const file = 'src/lib/cache/invalidation.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/revalidateTag\(tag\)/g, '(revalidateTag as any)(tag, "layout")');
content = content.replace(/revalidateTag\(`(.*?)`\)/g, '(revalidateTag as any)(`$1`, "layout")');
content = content.replace(/revalidateTag\('(.*?)'\)/g, '(revalidateTag as any)(\'$1\', "layout")');

fs.writeFileSync(file, content);
console.log("Restored invalidation.ts!");
