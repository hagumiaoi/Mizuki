import { getCollection } from 'astro:content';

const novels = await getCollection('novels');
console.log('\n=== ALL NOVEL ENTRIES ===');
novels.forEach(entry => {
  console.log(`ID: ${entry.id} | Title: ${entry.data.title}`);
});
