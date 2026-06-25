// ============================================================
// مسار تسجيل الدخول (مدرسين وطلاب) — مبسط بدون تعقيد JWT الآن
// ملاحظة: بهذه المرحلة نستخدم نظام جلسة مبسط، يُحسّن لاحقاً بـ JWT
// ============================================================
const express = require("express");
const bcrypt = require("bcryptjs");
const { prisma } = require("../lib/prisma");

const router = express.Router();

// ------------------------------------------------------------
// POST /api/auth/instructor/login
// ------------------------------------------------------------
router.post("/instructor/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: "البريد الإلكتروني أو كلمة المرور غير صحيحة" });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: "البريد الإلكتروني أو كلمة المرور غير صحيحة" });
    }

    res.json({
      id: user.id,
      name: user.name,
      role: user.role,
      subject: user.subject,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "حدث خطأ أثناء تسجيل الدخول" });
  }
});

// ------------------------------------------------------------
// POST /api/auth/student/login
// ------------------------------------------------------------
router.post("/student/login", async (req, res) => {
  const { phone, password } = req.body;

  try {
    const student = await prisma.student.findUnique({ where: { phone } });
    if (!student) {
      return res.status(401).json({ error: "رقم الجوال أو كلمة المرور غير صحيحة" });
    }

    const valid = await bcrypt.compare(password, student.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: "رقم الجوال أو كلمة المرور غير صحيحة" });
    }

    res.json({ id: student.id, name: student.name });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "حدث خطأ أثناء تسجيل الدخول" });
  }
});

// ------------------------------------------------------------
// POST /api/auth/instructor/register
// يستخدمه فقط الأستاذ أمير (SUPER_ADMIN) لإضافة مدرس جديد للكادر
// ------------------------------------------------------------
router.post("/instructor/register", async (req, res) => {
  const { name, email, password, subject, role } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: "الاسم والبريد وكلمة المرور مطلوبة" });
  }

  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: "هذا البريد الإلكتروني مستخدم مسبقاً" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        subject,
        role: role === "SUPER_ADMIN" ? "SUPER_ADMIN" : "INSTRUCTOR",
      },
    });

    res.status(201).json({ id: user.id, name: user.name, role: user.role });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "حدث خطأ أثناء إنشاء الحساب" });
  }
});

module.exports = router;
