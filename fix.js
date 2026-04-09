const fs = require('fs'); 
const file = 'src/lib/cache/invalidation.ts'; 
let content = fs.readFileSync(file, 'utf8'); 
content = content.replaceAll('(revalidateTag as any)(tag, "layout")', 'revalidateTag(tag)'); 
content = content.replaceAll(/\(revalidateTag as any\)\(`(.*?)`, "layout"\)/g, 'revalidateTag(`$1`)'); 
content = content.replaceAll(/\(revalidateTag as any\)\('(.*?)', "layout"\)/g, "revalidateTag('$1')"); 
fs.writeFileSync(file, content);
