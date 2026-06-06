<h1 align="center">
⚡️ Subtitle Translator (Forked Version)
</h1>
<p align="center">
    <a href="./README.md">English</a> | ភាសាខ្មែរ
</p>
<p align="center">
    <em>កម្មវិធីបកប្រែ Subtitle ដ៏រហ័សជាមួយភាសាខ្មែរ</em>
</p>

---

## 📌 អំពី Fork នេះ (About This Fork)
នេះគឺជាកំណែទម្រង់ដែលបានកែសម្រួល (customized version) នៃកម្មវិធីដ៏ល្អស្អាត [Subtitle Translator](https://github.com/rockbenben/subtitle-translator) ដែលបង្កើតឡើងដោយ [rockbenben](https://github.com/rockbenben)។

### 🔧 ការកែសម្រួល និងការធ្វើបច្ចុប្បន្នភាពសំខាន់ៗ (Key Customizations & Updates):
1. **Simplified Toolset**: បានលុបចោលរាល់ tools ផ្សេងៗដែលមិនពាក់ព័ន្ធ (parsers, text utilities) ដើម្បីរក្សាការផ្ដោតសំខាន់តែទៅលើការបកប្រែប៉ុណ្ណោះ (Subtitle Translator, Markdown Translator, និង Multi JSON Translator)។
2. **Khmer Language Support (`km`)**: 
   - បានបន្ថែម UI localization ពេញលេញសម្រាប់ភាសាខ្មែរ។
   - បានភ្ជាប់បន្ថែមនូវ **[Kantumruy Pro](https://fonts.google.com/specimen/Kantumruy+Pro)** Google Font ដែលត្រូវបានរៀបចំយ៉ាងល្អសម្រាប់ការបង្ហាញអក្សរខ្មែរ (Khmer rendering) ទាំងនៅលើ global styles និង Ant Design component theme។
3. **Qwen-MT Translation Support**: បង្កើនសមត្ថភាពបកប្រែជាមួយម៉ូដែល Qwen-MT សម្រាប់គុណភាពបកប្រែ និងល្បឿនកាន់តែលឿន។

### 💖 Credits
រាល់ការរចនា និងកូដស្នូល (core engine, UI layout, translation API integrations, and local caching) គឺជារបស់អ្នកបង្កើតដើម (original creator) **[rockbenben](https://github.com/rockbenben)**។ អ្នកអាចចូលទៅកាន់ repository ដើមនៅទីនេះ៖ [rockbenben/subtitle-translator](https://github.com/rockbenben/subtitle-translator)។

---

## លក្ខណៈពិសេសចម្បងៗ (Key Features)

- **Real-Time Translation**: បកប្រែរហ័សទាន់ចិត្ត ដោយប្រើ parallel processing → ប្រហែល 1 វិនាទីក្នុងមួយភាគ។
- **Batch Processing**: អាចបញ្ចូល subtitle files រាប់រយក្នុងពេលតែមួយ (មួយរដូវកាលពេញក្នុងពេលតែមួយ)។
- **Multi-Language Output**: បកប្រែទៅជាភាសាគោលដៅច្រើនក្នុងពេលតែមួយ — ភាសានីមួយៗនឹងត្រូវបានទាញយកជា file ដាច់ដោយឡែកពីគ្នា។
- **Format Compatibility**: គាំទ្ររាល់ទម្រង់ `.srt`, `.ass`, `.vtt`, និង `.lrc`។
- **Bilingual Output**: បង្ហាញភាសាដើម និងភាសាបកប្រែទន្ទឹមគ្នា។
- **Private by Design**: រាល់ទិន្នន័យទាំងអស់ដំណើរការនៅលើ browser របស់អ្នកផ្ទាល់ មិនឆ្លងកាត់ server ឡើយ។

## Tech Stack

- **Framework**: [Next.js 16](https://nextjs.org/) (App Router) + React 19
- **UI**: [Ant Design 6](https://ant.design/) + [Tailwind CSS 4](https://tailwindcss.com/)
- **i18n**: [next-intl](https://next-intl-docs.vercel.app/)
- **Caching**: [idb](https://github.com/jakearchibald/idb) (IndexedDB)

## การចាប់ផ្ដើមដំណើរការ (Getting Started)

### លក្ខខណ្ឌតម្រូវ (Requirements)

- Node.js >= 20.9.0
- Yarn, npm, ឬ pnpm

### ការដំឡើង និងដំណើរការ (Install & Run)

```bash
git clone https://github.com/chheunphannet/kh-subtitle-translator.git
cd kh-subtitle-translator

yarn install
yarn dev
```

បើកមើលតាមរយៈ [http://localhost:3000](http://localhost:3000)។

---

## License

MIT © 2025 [rockbenben](https://github.com/rockbenben). See [LICENSE](./LICENSE).
