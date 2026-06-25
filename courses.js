// ============================================================
// مسار الكورسات: إنشاء كورس، عرض الكورسات، توليد أكواد دعوة
// ============================================================
const express = require("express");
const { prisma } = require("../lib/prisma");
const { generateInviteCode } = require("../lib/generateCode");

const router = express.Router();

// ------------------------------------------------------------
// GET /api/courses
// كل الكورسات بالمنصة (لصفحة "تصفح المدرسين" العامة)
// ------------------------------------------------------------
router.get("/", async (req, res) => {
  try {
    const courses = await prisma.course.findMany({
      include: {
        instructor: { select: { id: true, name: true, subject: true, avatarUrl: true } },
        _count: { select: { enrollments: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json(courses);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "حدث خطأ أثناء جلب الكورسات" });
  }
});

// ------------------------------------------------------------
// GET /api/courses/instructor/:instructorId
// كل كورسات مدرس معين (لصفحة بروفايله العامة)
// ------------------------------------------------------------
router.get("/instructor/:instructorId", async (req, res) => {
  try {
    const courses = await prisma.course.findMany({
      where: { instructorId: req.params.instructorId },
      include: { _count: { select: { enrollments: true } } },
    });
    res.json(courses);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "حدث خطأ أثناء جلب كورسات المدرس" });
  }
});

// ------------------------------------------------------------
// POST /api/courses
// إنشاء كورس جديد (من لوحة المدرس)
// ------------------------------------------------------------
router.post("/", async (req, res) => {
  const { title, description, instructorId } = req.body;

  if (!title || !instructorId) {
    return res.status(400).json({ error: "عنوان الكورس ومعرّف المدرس مطلوبان" });
  }

  try {
    const course = await prisma.course.create({
      data: { title, description, instructorId, isFree: true, price: 0 },
    });
    res.status(201).json(course);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "حدث خطأ أثناء إنشاء الكورس" });
  }
});

// ------------------------------------------------------------
// POST /api/courses/:courseId/invite-codes
// توليد عدد من أكواد الدعوة لكورس معين
// body: { count: 10 }
// ------------------------------------------------------------
router.post("/:courseId/invite-codes", async (req, res) => {
  const { courseId } = req.params;
  const count = Math.min(req.body.count || 1, 200); // حد أعلى أمان: 200 كود بكل مرة

  try {
    const course = await prisma.course.findUnique({ where: { id: courseId } });
    if (!course) {
      return res.status(404).json({ error: "الكورس غير موجود" });
    }

    const prefix = course.title.split(" ")[0] || "CRS";
    const codesToCreate = [];

    // نولّد الأكواد ونتأكد من عدم التكرار قبل الحفظ
    for (let i = 0; i < count; i++) {
      let code;
      let attempts = 0;
      do {
        code = generateInviteCode(prefix);
        attempts++;
      } while (
        (await prisma.inviteCode.findUnique({ where: { code } })) &&
        attempts < 5
      );
      codesToCreate.push({ code, courseId });
    }

    await prisma.inviteCode.createMany({ data: codesToCreate });

    const created = await prisma.inviteCode.findMany({
      where: { courseId, code: { in: codesToCreate.map((c) => c.code) } },
    });

    res.status(201).json(created);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "حدث خطأ أثناء توليد الأكواد" });
  }
});

// ------------------------------------------------------------
// GET /api/courses/:courseId/invite-codes
// عرض كل أكواد كورس معين (مستخدمة وغير مستخدمة)
// ------------------------------------------------------------
router.get("/:courseId/invite-codes", async (req, res) => {
  try {
    const codes = await prisma.inviteCode.findMany({
      where: { courseId: req.params.courseId },
      orderBy: { createdAt: "desc" },
    });
    res.json(codes);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "حدث خطأ أثناء جلب الأكواد" });
  }
});

module.exports = router;
