// ============================================================
// مسار تسجيل الطالب باستخدام كود الدعوة
// هذا هو المسار الأهم: التحقق من الكود وتسجيل الطالب يصير
// تلقائياً 100% بدون أي تدخل يدوي من المدرس.
// ============================================================
const express = require("express");
const bcrypt = require("bcryptjs");
const { prisma } = require("../lib/prisma");

const router = express.Router();

// ------------------------------------------------------------
// POST /api/enrollment/redeem
// الطالب يدخل: اسمه، جواله، كلمة مرور يختارها، والكود
// ------------------------------------------------------------
router.post("/redeem", async (req, res) => {
  const { name, phone, password, code } = req.body;

  if (!name || !phone || !password || !code) {
    return res.status(400).json({ error: "كل الحقول مطلوبة (الاسم، الجوال، كلمة المرور، الكود)" });
  }

  try {
    // 1. التحقق من وجود الكود وأنه غير مستخدم
    const inviteCode = await prisma.inviteCode.findUnique({
      where: { code: code.trim().toUpperCase() },
      include: { course: true },
    });

    if (!inviteCode) {
      return res.status(404).json({ error: "الكود غير صحيح، تأكد من كتابته بشكل صحيح" });
    }

    if (inviteCode.isUsed) {
      return res.status(409).json({ error: "هذا الكود مُستخدم مسبقاً" });
    }

    // 2. التحقق من وجود الطالب (بنفس رقم الجوال) أو إنشاء حساب جديد
    let student = await prisma.student.findUnique({ where: { phone } });

    if (!student) {
      const passwordHash = await bcrypt.hash(password, 10);
      student = await prisma.student.create({
        data: { name, phone, passwordHash },
      });
    }

    // 3. التحقق من عدم التسجيل المسبق بنفس الكورس
    const existingEnrollment = await prisma.enrollment.findUnique({
      where: {
        studentId_courseId: {
          studentId: student.id,
          courseId: inviteCode.courseId,
        },
      },
    });

    if (existingEnrollment) {
      return res.status(409).json({ error: "أنت مسجّل بالفعل بهذا الكورس" });
    }

    // 4. كل هذا يصير بعملية واحدة (transaction) — لو فشل أي جزء، يتراجع الكل
    //    هذا يضمن عدم وجود حالة "كود استُخدم بدون تسجيل فعلي" أو العكس
    const result = await prisma.$transaction([
      prisma.enrollment.create({
        data: {
          studentId: student.id,
          courseId: inviteCode.courseId,
        },
      }),
      prisma.inviteCode.update({
        where: { id: inviteCode.id },
        data: {
          isUsed: true,
          usedById: student.id,
          usedAt: new Date(),
        },
      }),
    ]);

    return res.status(201).json({
      message: "تم تسجيلك بالكورس بنجاح",
      course: {
        id: inviteCode.course.id,
        title: inviteCode.course.title,
      },
      student: {
        id: student.id,
        name: student.name,
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "حدث خطأ أثناء التسجيل، حاول مرة أخرى" });
  }
});

// ------------------------------------------------------------
// GET /api/enrollment/my-courses/:studentId
// يعرض كل الكورسات اللي الطالب مسجّل بها
// ------------------------------------------------------------
router.get("/my-courses/:studentId", async (req, res) => {
  try {
    const enrollments = await prisma.enrollment.findMany({
      where: { studentId: req.params.studentId },
      include: {
        course: {
          include: { instructor: { select: { name: true, subject: true } } },
        },
      },
    });

    res.json(enrollments.map((e) => e.course));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "حدث خطأ أثناء جلب الكورسات" });
  }
});

module.exports = router;
