// ============================================================
// مسار المحتوى المشترك (ملازم + بنوك أسئلة)
// يطبّق القواعد المتفق عليها بالكامل:
// - المالك فقط يعدّل/يحذف/يشارك
// - المستلِم يربط بحرية، لكن الفك يحتاج طلب + مهلة 48 ساعة
// ============================================================
const express = require("express");
const { prisma } = require("../lib/prisma");

const router = express.Router();
const UNLINK_DEADLINE_HOURS = 48;

// ------------------------------------------------------------
// POST /api/content/:contentItemId/share
// المالك يشارك المحتوى مع مدرس معين
// ------------------------------------------------------------
router.post("/:contentItemId/share", async (req, res) => {
  const { contentItemId } = req.params;
  const { sharedById, sharedWithId } = req.body;

  try {
    const content = await prisma.contentItem.findUnique({ where: { id: contentItemId } });
    if (!content) return res.status(404).json({ error: "المحتوى غير موجود" });

    // فقط المالك الأصلي يقدر يشارك
    if (content.ownerId !== sharedById) {
      return res.status(403).json({ error: "فقط المالك الأصلي يقدر يشارك هذا المحتوى" });
    }

    const share = await prisma.contentShare.create({
      data: { contentItemId, sharedById, sharedWithId },
    });

    res.status(201).json(share);
  } catch (error) {
    if (error.code === "P2002") {
      return res.status(409).json({ error: "هذا المحتوى مُشارَك مسبقاً مع هذا المدرس" });
    }
    console.error(error);
    res.status(500).json({ error: "حدث خطأ أثناء المشاركة" });
  }
});

// ------------------------------------------------------------
// GET /api/content/shared-with/:instructorId
// المحتوى المشترك مع مدرس معين (قسم "محتوى مشارك معي")
// ------------------------------------------------------------
router.get("/shared-with/:instructorId", async (req, res) => {
  try {
    const shares = await prisma.contentShare.findMany({
      where: { sharedWithId: req.params.instructorId },
      include: {
        contentItem: { include: { owner: { select: { name: true } } } },
      },
    });
    res.json(shares);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "حدث خطأ أثناء جلب المحتوى المشترك" });
  }
});

// ------------------------------------------------------------
// POST /api/content/:contentItemId/link
// المدرس المستلِم يربط المحتوى بكورسه الخاص (يحتاج مشاركة سابقة)
// ------------------------------------------------------------
router.post("/:contentItemId/link", async (req, res) => {
  const { contentItemId } = req.params;
  const { courseId, instructorId } = req.body;

  try {
    const course = await prisma.course.findUnique({ where: { id: courseId } });
    if (!course) return res.status(404).json({ error: "الكورس غير موجود" });

    const content = await prisma.contentItem.findUnique({ where: { id: contentItemId } });
    if (!content) return res.status(404).json({ error: "المحتوى غير موجود" });

    // لو المدرس ليس المالك، لازم تكون فيه مشاركة صريحة له
    if (content.ownerId !== instructorId) {
      const share = await prisma.contentShare.findUnique({
        where: { contentItemId_sharedWithId: { contentItemId, sharedWithId: instructorId } },
      });
      if (!share) {
        return res.status(403).json({ error: "هذا المحتوى لم يُشارَك معك من المالك الأصلي" });
      }
    }

    // الكورس لازم يكون ملك المدرس نفسه
    if (course.instructorId !== instructorId) {
      return res.status(403).json({ error: "لا تملك صلاحية الربط بهذا الكورس" });
    }

    const link = await prisma.courseContentLink.create({
      data: { contentItemId, courseId },
    });

    res.status(201).json(link);
  } catch (error) {
    if (error.code === "P2002") {
      return res.status(409).json({ error: "هذا المحتوى مربوط مسبقاً بهذا الكورس" });
    }
    console.error(error);
    res.status(500).json({ error: "حدث خطأ أثناء الربط" });
  }
});

// ------------------------------------------------------------
// POST /api/content/links/:linkId/request-unlink
// المدرس المستلِم يطلب فك الربط — يحتاج موافقة المالك أو مهلة 48 ساعة
// ------------------------------------------------------------
router.post("/links/:linkId/request-unlink", async (req, res) => {
  const { linkId } = req.params;
  const { requestedById } = req.body;

  try {
    const link = await prisma.courseContentLink.findUnique({
      where: { id: linkId },
      include: { contentItem: true, course: true },
    });
    if (!link) return res.status(404).json({ error: "الربط غير موجود" });

    // المالك الأصلي يقدر يفك فوراً بدون طلب
    if (link.contentItem.ownerId === requestedById) {
      await prisma.courseContentLink.delete({ where: { id: linkId } });
      return res.json({ message: "تم فك الربط فوراً (أنت المالك الأصلي)" });
    }

    const deadlineAt = new Date(Date.now() + UNLINK_DEADLINE_HOURS * 60 * 60 * 1000);

    const request = await prisma.unlinkRequest.create({
      data: {
        courseContentLinkId: linkId,
        requestedById,
        deadlineAt,
      },
    });

    res.status(201).json({
      message: `تم إرسال طلب الفك للمالك الأصلي. سيُفك تلقائياً بعد ${UNLINK_DEADLINE_HOURS} ساعة إذا لم يُتخذ قرار`,
      request,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "حدث خطأ أثناء إرسال طلب الفك" });
  }
});

// ------------------------------------------------------------
// POST /api/content/unlink-requests/:requestId/decide
// المالك الأصلي يوافق أو يرفض طلب الفك
// body: { approved: true/false }
// ------------------------------------------------------------
router.post("/unlink-requests/:requestId/decide", async (req, res) => {
  const { requestId } = req.params;
  const { approved } = req.body;

  try {
    const request = await prisma.unlinkRequest.findUnique({
      where: { id: requestId },
      include: { courseContentLink: true },
    });
    if (!request) return res.status(404).json({ error: "الطلب غير موجود" });

    if (approved) {
      await prisma.$transaction([
        prisma.courseContentLink.delete({ where: { id: request.courseContentLinkId } }),
        prisma.unlinkRequest.update({
          where: { id: requestId },
          data: { status: "APPROVED", resolvedAt: new Date() },
        }),
      ]);
      return res.json({ message: "تمت الموافقة على الفك" });
    } else {
      await prisma.unlinkRequest.update({
        where: { id: requestId },
        data: { status: "REJECTED", resolvedAt: new Date() },
      });
      return res.json({ message: "تم رفض طلب الفك، يبقى المحتوى مربوطاً" });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "حدث خطأ أثناء معالجة الطلب" });
  }
});

// ------------------------------------------------------------
// هذه الدالة تُستدعى دورياً (cron job) لفك أي طلب تجاوز المهلة
// بدون رد من المالك — auto-approve بعد 48 ساعة
// ------------------------------------------------------------
async function processExpiredUnlinkRequests() {
  const expired = await prisma.unlinkRequest.findMany({
    where: { status: "PENDING", deadlineAt: { lte: new Date() } },
  });

  for (const request of expired) {
    await prisma.$transaction([
      prisma.courseContentLink.delete({ where: { id: request.courseContentLinkId } }),
      prisma.unlinkRequest.update({
        where: { id: request.id },
        data: { status: "AUTO_APPROVED", resolvedAt: new Date() },
      }),
    ]);
  }

  return expired.length;
}

module.exports = router;
module.exports.processExpiredUnlinkRequests = processExpiredUnlinkRequests;
