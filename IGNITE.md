# Ignite في هذا القالب

[Ignite](https://ignite.dev/) هي أداة CLI لتوليد الكود وقوالب React Native وExpo. لا تفرض شكل التطبيق النهائي؛ بل تشغّل القوالب التي يحددها الفريق داخل مجلد `ignite/templates`، ثم تستبدل اسم الميزة في الملفات والكود الناتج.

في هذا المشروع، يكون دور Ignite هو تسريع بناء الميزات بعد أن يوفر القالب أساس الواجهة: Expo Router وSafe Area وTheme وNativeWind والمكونات العامة. بدل إنشاء ملفات متعددة يدويًا، يمكن أن يصبح الأمر مثل:

```bash
npx ignite-cli generate feature Orders --case=kebab
```

## ما الذي يمكن أن يولده؟

القالب **المتوسط** يمكنه إنشاء route وشاشة وأنواع TypeScript وطبقة API واختبار مبدئي:

```text
app/orders.tsx
features/orders/
├── orders.screen.tsx
├── orders.api.ts
├── orders.types.ts
└── orders.screen.test.tsx
```

أما القالب **المتقدم** فيستطيع إضافة TanStack Query وSupabase calls وZod validation وحالات loading/error وواجهات فرعية وربط المسار المحمي:

```text
features/orders/
├── api/
├── components/
├── hooks/
├── screens/
├── schemas/
├── types/
└── tests/
```

تكون الملفات الناتجة حاوية على كود مبدئي صالح للتطوير، وليست فارغة. لكن Ignite لا يعرف منطق التطبيق تلقائيًا؛ لذلك نكتب conventions وSupabase patterns والـUI patterns داخل القوالب مرة واحدة، ثم يطبقها على كل Feature جديدة بصورة متسقة.

> القاعدة المهمة: استخدم `PascalCase` لأسماء المكونات والأنواع، و`kebab-case` لأسماء الملفات والمسارات. عند استخدام `--case=kebab` يجب أن تعتمد imports الداخلية على `kebabCaseName` حتى تطابق أسماء الملفات الفعلية.

## المسار المقترح

```text
Manus mobile-app template
        ↓
Ignite feature generator
        ↓
Feature: route + screen + Supabase API + query hooks + types + tests
```

المراجع: [Ignite documentation](https://docs.infinite.red/ignite-cli/concept/Generators/) و[Expo guide to Ignite Generators](https://expo.dev/blog/increase-your-expo-power-with-ignite-generators).
