// ============================================================
// سكريبت تعبئة البيانات الأولية (Seed)
// يُشغَّل مرة واحدة بعد إنشاء قاعدة البيانات لأول مرة، عشان نضيف
// كل المدرسين اللي ذكرتهم بدون الحاجة نكتبهم يدوياً من الصفر
// ============================================================
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  console.log("بدء تعبئة البيانات الأولية...");

  const defaultPassword = await bcrypt.hash("ChangeMe123!", 10);

  const instructors = [
    { name: "أ. أمير محمد", email: "amir@academia.local", subject: "الطبيعيات", role: "SUPER_ADMIN" },
    { name: "أ. نور الحسيني", email: "nour@academia.local", subject: "اللغة العربية والتربية الإسلامية", role: "INSTRUCTOR" },
    { name: "أ. أحمد عادل", email: "ahmad@academia.local", subject: "اللغة الإنكليزية وجميع فروع المهنية", role: "INSTRUCTOR" },
    { name: "أ. زياد محمد", email: "ziad@academia.local", subject: "الرياضيات وجميع أقسام المهني", role: "INSTRUCTOR" },
    { name: "أ. محمد يونس", email: "muhammad@academia.local", subject: "المعالجات والشبكات والصيانة", role: "INSTRUCTOR" },
  ];

  for (const ins of instructors) {
    const user = await prisma.user.upsert({
      where: { email: ins.email },
      update: {},
      create: { ...ins, passwordHash: defaultPassword },
    });
    console.log(`✓ تمت إضافة: ${user.name}`);
  }

  console.log("\nتمت تعبئة البيانات بنجاح.");
  console.log("كلمة المرور الافتراضية لكل المدرسين: ChangeMe123!");
  console.log("⚠️  مهم: لازم كل مدرس يغيّر كلمة مروره فوراً بعد أول تسجيل دخول.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
