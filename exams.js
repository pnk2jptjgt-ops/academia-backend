// ============================================================
// مسار الامتحانات
// اختيار من متعدد → تصحيح فوري تلقائي
// مقالي → يُحفظ وينتظر تصحيح يدوي من المدرس
// ============================================================
const express = require("express");
const { prisma } = require("../lib/prisma");

const router = express.Router();

// ------------------------------------------------------------
// POST /api/exams
// إنشاء امتحان جديد مع أسئلته
// body: { title, courseId, questions: [{ type, questionText, choices, correctChoice }] }
// ------------------------------------------------------------
router.post("/", async (req, res) => {
  const { title, courseId, questions } = req.body;

  try {
    const exam = await prisma.exam.create({
      data: {
        title,
        courseId,
        questions: {
          create: questions.map((q, i) => ({
            type: q.type,
            questionText: q.questionText,
            choices: q.choices || [],
            correctChoice: q.correctChoice ?? null,
            order: i,
          })),
        },
      },
      include: { questions: true },
    });

    res.status(201).json(exam);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "حدث خطأ أثناء إنشاء الامتحان" });
  }
});

// ------------------------------------------------------------
// GET /api/exams/:examId
// لعرض الامتحان للطالب (بدون إظهار الإجابة الصحيحة!)
// ------------------------------------------------------------
router.get("/:examId", async (req, res) => {
  try {
    const exam = await prisma.exam.findUnique({
      where: { id: req.params.examId },
      include: { questions: { orderBy: { order: "asc" } } },
    });

    if (!exam) return res.status(404).json({ error: "الامتحان غير موجود" });

    // نحذف correctChoice قبل إرسال الامتحان للطالب — حماية أساسية
    const safeExam = {
      ...exam,
      questions: exam.questions.map(({ correctChoice, ...q }) => q),
    };

    res.json(safeExam);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "حدث خطأ أثناء جلب الامتحان" });
  }
});

// ------------------------------------------------------------
// POST /api/exams/:examId/submit
// تسليم إجابات الطالب — تصحيح فوري لكل أسئلة الاختيار من متعدد
// body: { studentId, answers: { questionId: choiceIndex أو نص } }
// ------------------------------------------------------------
router.post("/:examId/submit", async (req, res) => {
  const { examId } = req.params;
  const { studentId, answers } = req.body;

  try {
    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      include: { questions: true },
    });
    if (!exam) return res.status(404).json({ error: "الامتحان غير موجود" });

    // تصحيح فوري: نحسب الدرجة فقط من أسئلة الاختيار من متعدد
    const mcqQuestions = exam.questions.filter((q) => q.type === "MULTIPLE_CHOICE");
    let correctCount = 0;

    for (const q of mcqQuestions) {
      const studentAnswer = answers[q.id];
      if (studentAnswer !== undefined && Number(studentAnswer) === q.correctChoice) {
        correctCount++;
      }
    }

    const autoScore = mcqQuestions.length > 0
      ? Math.round((correctCount / mcqQuestions.length) * 100)
      : null;

    const hasEssayQuestions = exam.questions.some((q) => q.type === "ESSAY");

    const attempt = await prisma.examAttempt.create({
      data: {
        examId,
        studentId,
        answers,
        autoScore,
        // لو فيه أسئلة مقالية، الدرجة النهائية تنتظر تصحيح يدوي
        gradedAt: hasEssayQuestions ? null : new Date(),
      },
    });

    res.status(201).json({
      message: hasEssayQuestions
        ? "تم تسليم إجابتك. الأسئلة الاختيارية صُححت فوراً، والأسئلة المقالية بانتظار تصحيح المدرس"
        : "تم تصحيح امتحانك فوراً",
      autoScore,
      totalMCQ: mcqQuestions.length,
      correctMCQ: correctCount,
      pendingManualGrading: hasEssayQuestions,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "حدث خطأ أثناء تسليم الامتحان" });
  }
});

// ------------------------------------------------------------
// POST /api/exams/attempts/:attemptId/grade
// المدرس يصحح الأسئلة المقالية يدوياً
// body: { manualScore }
// ------------------------------------------------------------
router.post("/attempts/:attemptId/grade", async (req, res) => {
  const { attemptId } = req.params;
  const { manualScore } = req.body;

  try {
    const attempt = await prisma.examAttempt.update({
      where: { id: attemptId },
      data: { manualScore, gradedAt: new Date() },
    });
    res.json(attempt);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "حدث خطأ أثناء حفظ الدرجة" });
  }
});

// ------------------------------------------------------------
// GET /api/exams/:examId/statistics
// إحصائية سريعة للمدرس: متوسط الدرجات، عدد المحاولات
// ------------------------------------------------------------
router.get("/:examId/statistics", async (req, res) => {
  try {
    const attempts = await prisma.examAttempt.findMany({
      where: { examId: req.params.examId },
    });

    const graded = attempts.filter((a) => a.autoScore !== null);
    const average = graded.length > 0
      ? graded.reduce((sum, a) => sum + a.autoScore, 0) / graded.length
      : null;

    res.json({
      totalAttempts: attempts.length,
      averageAutoScore: average ? Math.round(average) : null,
      pendingManualGrading: attempts.filter((a) => a.gradedAt === null).length,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "حدث خطأ أثناء جلب الإحصائية" });
  }
});

module.exports = router;
