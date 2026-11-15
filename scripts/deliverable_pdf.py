"""Build the self-contained Deliverable 1 review PDF from repository documents.

Run with Python 3 and reportlab, markdown-it-py, and pypdf installed.
The evidence manifest is intentionally explicit: building cannot accept a release.
"""

import html
import hashlib
import json
import textwrap
from pathlib import Path

from markdown_it import MarkdownIt
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    Image,
    PageBreak,
    PageTemplate,
    Paragraph,
    Preformatted,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs/deliverables/deliverable-1"
OUTPUT = ROOT / "output/pdf/project-deliverable-1.pdf"
WIDTH, HEIGHT = A4
CONTENT_WIDTH = WIDTH - 88
INK = colors.HexColor("#183d32")
MUTED = colors.HexColor("#53655f")
PALE = colors.HexColor("#edf2ef")
MD = MarkdownIt("commonmark").enable("table")


def register_fonts():
    # ReportLab's bundled Vera family makes output independent of OS fonts.
    import reportlab

    fonts = Path(reportlab.__file__).parent / "fonts"
    for name, filename in [
        ("Body", "Vera.ttf"),
        ("BodyBold", "VeraBd.ttf"),
        ("BodyItalic", "VeraIt.ttf"),
        ("BodyBoldItalic", "VeraBI.ttf"),
    ]:
        pdfmetrics.registerFont(TTFont(name, str(fonts / filename)))
    pdfmetrics.registerFontFamily(
        "Body", normal="Body", bold="BodyBold", italic="BodyItalic",
        boldItalic="BodyBoldItalic",
    )


register_fonts()
STYLES = getSampleStyleSheet()
STYLES.add(ParagraphStyle(
    "BodyTextPDF", fontName="Body", fontSize=9.4, leading=13.4,
    textColor=INK, spaceAfter=7, splitLongWords=True,
))
STYLES.add(ParagraphStyle(
    "CellPDF", parent=STYLES["BodyTextPDF"], fontSize=7.7,
    leading=10.6, spaceAfter=0,
))
STYLES.add(ParagraphStyle(
    "SmallPDF", parent=STYLES["BodyTextPDF"], fontSize=8,
    leading=11.4, textColor=MUTED,
))
for level, size in [(1, 21), (2, 14), (3, 11), (4, 10)]:
    STYLES.add(ParagraphStyle(
        f"H{level}PDF", fontName="BodyBold", fontSize=size,
        leading=size * 1.25, spaceBefore=12, spaceAfter=8,
        textColor=INK, keepWithNext=True,
    ))
STYLES.add(ParagraphStyle(
    "CodePDF", fontName="Courier", fontSize=7.2, leading=9.6,
    backColor=PALE, borderPadding=7, spaceBefore=5, spaceAfter=9,
))


def normalize(value):
    value = value.translate(str.maketrans({
        "\u2013": "-", "\u2014": " - ", "\u2011": "-",
        "\u2192": " -> ", "\u2190": " <- ", "\u2264": "<=",
        "\u2265": ">=", "\u2212": "-", "\u00a0": " ",
        "\u2713": "PASS", "\u2714": "PASS", "\u2717": "FAIL",
    }))
    return value


def inline(tokens):
    result = []
    for token in tokens or []:
        if token.type == "text":
            result.append(html.escape(normalize(token.content)))
        elif token.type == "code_inline":
            result.append('<font name="Courier">' + html.escape(normalize(token.content)) + '</font>')
        elif token.type == "strong_open":
            result.append("<b>")
        elif token.type == "strong_close":
            result.append("</b>")
        elif token.type == "em_open":
            result.append("<i>")
        elif token.type == "em_close":
            result.append("</i>")
        elif token.type in {"softbreak", "hardbreak"}:
            result.append("<br/>" if token.type == "hardbreak" else " ")
        # Links retain readable labels. Full external references appear in Part F.
    return "".join(result)


def table_widths(rows):
    count = len(rows[0])
    if count == 7:  # Feature inventory.
        weights = [0.055, 0.18, 0.19, 0.16, 0.065, 0.105, 0.245]
    elif count == 5:  # Baseline traceability and engineering contracts.
        weights = [0.12, 0.16, 0.17, 0.43, 0.12]
    elif count == 4:
        weights = [0.17, 0.14, 0.34, 0.35]
    elif count == 3:
        weights = [0.18, 0.47, 0.35]
    else:
        weights = [1 / count] * count
    total = sum(weights)
    return [CONTENT_WIDTH * weight / total for weight in weights]


def make_table(rows, widths=None):
    data = [[Paragraph(cell or " ", STYLES["CellPDF"]) for cell in row] for row in rows]
    table = Table(data, colWidths=widths or table_widths(rows), repeatRows=1, hAlign="LEFT")
    table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BACKGROUND", (0, 0), (-1, 0), PALE),
        ("LINEBELOW", (0, 0), (-1, 0), 0.7, INK),
        ("LINEBELOW", (0, 1), (-1, -1), 0.25, colors.HexColor("#d4ded8")),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    return table


def markdown(path):
    tokens = MD.parse(path.read_text())
    flow = []
    index = 0
    list_depth = 0
    bullet = False
    while index < len(tokens):
        token = tokens[index]
        if token.type == "heading_open":
            content = inline(tokens[index + 1].children)
            level = min(int(token.tag[1:]) + 1, 4)
            flow.append(Paragraph(content, STYLES[f"H{level}PDF"]))
            index += 3
            continue
        if token.type == "table_open":
            rows = []
            row = []
            index += 1
            while tokens[index].type != "table_close":
                current = tokens[index]
                if current.type == "tr_open":
                    row = []
                elif current.type == "inline":
                    row.append(inline(current.children))
                elif current.type == "tr_close":
                    rows.append(row)
                index += 1
            flow.extend([make_table(rows), Spacer(1, 10)])
        elif token.type in {"bullet_list_open", "ordered_list_open"}:
            list_depth += 1
        elif token.type in {"bullet_list_close", "ordered_list_close"}:
            list_depth -= 1
        elif token.type == "list_item_open":
            bullet = True
        elif token.type == "paragraph_open":
            item = tokens[index + 1]
            if item.children and len(item.children) == 1 and item.children[0].type == "image":
                image_token = item.children[0]
                image_path = path.parent / image_token.attrGet("src")
                picture = Image(str(image_path))
                scale = min(CONTENT_WIDTH / picture.imageWidth, 430 / picture.imageHeight, 1)
                picture.drawWidth = picture.imageWidth * scale
                picture.drawHeight = picture.imageHeight * scale
                picture.hAlign = "LEFT"
                flow.extend([picture, Spacer(1, 8)])
            else:
                text = inline(item.children)
                if list_depth and bullet:
                    text = "&#8226; " + text
                    bullet = False
                flow.append(Paragraph(text, STYLES["BodyTextPDF"]))
            index += 3
            continue
        elif token.type == "fence":
            lines = []
            for line in normalize(token.content).splitlines():
                lines.extend(textwrap.wrap(line, width=108, replace_whitespace=False,
                                           drop_whitespace=False) or [""])
            flow.append(Preformatted("\n".join(lines), STYLES["CodePDF"]))
        elif token.type == "hr":
            flow.append(Spacer(1, 8))
        index += 1
    return flow


class Document(BaseDocTemplate):
    def __init__(self, path):
        super().__init__(str(path), pagesize=A4, leftMargin=44, rightMargin=44,
                         topMargin=46, bottomMargin=42,
                         title="Habitarc - CPE 334 Project Deliverable 1",
                         author="Theeraphat Jaingam; Chanya Poolketkij")
        self.part_pages = {}
        self.addPageTemplates(PageTemplate(
            id="main", frames=Frame(44, 42, CONTENT_WIDTH, HEIGHT - 88,
                                    leftPadding=0, rightPadding=0,
                                    topPadding=0, bottomPadding=0),
            onPage=self.decorate,
        ))

    def decorate(self, canvas, doc):
        canvas.setStrokeColor(colors.HexColor("#d4ded8"))
        canvas.line(44, HEIGHT - 31, WIDTH - 44, HEIGHT - 31)
        canvas.setFont("Body", 7)
        canvas.setFillColor(MUTED)
        canvas.drawString(44, HEIGHT - 23, "HABITARC  /  CPE 334  /  PROJECT DELIVERABLE 1")
        metadata = json.loads((SOURCE / "submission.json").read_text())
        footer = "Review copy - acceptance gates disclosed in Part F"
        if metadata["acceptedReleaseCommit"]:
            footer = "Assessed release - verification and limitations in Part F"
        canvas.drawString(44, 24, footer)
        canvas.drawRightString(WIDTH - 44, 24, str(doc.page))

    def afterFlowable(self, flowable):
        if hasattr(flowable, "part_id"):
            self.part_pages[flowable.part_id] = self.page
            self.canv.bookmarkPage(flowable.part_id)
            self.canv.addOutlineEntry(flowable.getPlainText(), flowable.part_id, 0)


PARTS = [
    ("A", "SRS and product scope", ["docs/srs.md", "GLOSSARY.md"], "FR-01-12; BR-01-17; NFR-01-08"),
    ("B", "Feature inventory and traceability", ["docs/features.md", "docs/traceability.md"], "F01-F12; all FR/BR/NFR"),
    ("C", "System-Level SDS", ["docs/system-sds.md"], "Architecture; data; access; delivery"),
    ("D", "Three-sprint plan", ["docs/sprints/plan.md"], "Sprints 1-3; F01-F12; M01"),
    ("E", "Sprint 1 engineering contracts", [
        "docs/sprints/sprint-1/f01-accounts-and-authorization.md",
        "docs/sprints/sprint-1/f02-template-creation-and-selection.md",
        "docs/sprints/sprint-1/f03-habit-setup.md",
        "docs/sprints/sprint-1/f04-activity-recording-and-today.md",
        "docs/sprints/sprint-1/f05-reproducible-persistence-and-delivery.md",
        "docs/deliverables/deliverable-1/dod.md",
    ], "F01-F05; 20 AC/STS pairs; Product DoD"),
    ("F", "Working Sprint 1 and verification", ["docs/deliverables/deliverable-1/part-f.md"], "Execution; demonstrations; reviews; gaps"),
]


def story(page_map=None, total_pages=None):
    metadata = json.loads((SOURCE / "submission.json").read_text())
    release = metadata["acceptedReleaseCommit"]
    flow = [Spacer(1, 28), Paragraph("Habitarc", STYLES["H1PDF"]),
            Paragraph("CPE 334 Project Deliverable 1", STYLES["H2PDF"]),
            Paragraph("Engineering baseline and working Sprint 1", STYLES["BodyTextPDF"]),
            Spacer(1, 16)]
    for student in metadata["students"]:
        flow.append(Paragraph(f'{student["id"]} &nbsp; {student["name"]}', STYLES["BodyTextPDF"]))
    for text in [
        "Theme/context: Habit and Activity Tracking - students' study and movement routines.",
        f'Repository: {metadata["repository"]}',
        f'Tested application candidate: {metadata["testedApplicationCommit"]}',
        f"Submitted release: {release}" if release else "Submitted release: PENDING - no accepted main release/tag is claimed.",
        "Prepared 15 November 2026, Asia/Bangkok. Local results are agent-executed; student acceptance remains explicit.",
    ]:
        flow.append(Paragraph(html.escape(text), STYLES["BodyTextPDF"]))
    flow.extend([Spacer(1, 10), Paragraph("Contents and assessment navigation", STYLES["H2PDF"])])
    rows = [["Part", "Pages", "Relevant IDs and content"]]
    for index, (part, title, _, ids) in enumerate(PARTS):
        end = None
        if page_map:
            end = page_map[PARTS[index + 1][0]] - 1 if index + 1 < len(PARTS) else total_pages
        page_range = f"{page_map[part]}-{end}" if page_map else "--"
        rows.append([f"{part}. {title}", page_range, ids])
    flow.append(make_table(rows, [CONTENT_WIDTH * .42, CONTENT_WIDTH * .1, CONTENT_WIDTH * .48]))
    flow.append(Spacer(1, 12))
    note = "Docker/GCP completion is a separate Lab 5 obligation."
    if not release:
        note = (
            "This engineering/evidence review package discloses unresolved submission gates. "
            "Before submission, record teammate clean-setup acceptance and the reviewed main release, "
            "then regenerate against that immutable version. " + note
        )
    flow.append(Paragraph(note, STYLES["SmallPDF"]))
    for part, title, files, _ in PARTS:
        flow.append(PageBreak())
        heading = Paragraph(f"Part {part}. {title}", STYLES["H1PDF"])
        heading.part_id = part
        flow.append(heading)
        for filename in files:
            flow.extend(markdown(ROOT / filename))
    return flow


def main():
    manifest = json.loads((SOURCE / "evidence/source-manifest.json").read_text())
    for filename, expected in manifest["sha256"].items():
        actual = hashlib.sha256((ROOT / filename).read_bytes()).hexdigest()
        if actual != expected:
            raise RuntimeError(f"Tested source changed: {filename}; refresh verification before building.")
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    draft = OUTPUT.with_name(".deliverable-layout.pdf")
    first = Document(draft)
    first.build(story())
    total = first.page
    final = Document(OUTPUT)
    final.build(story(first.part_pages, total))
    if final.part_pages != first.part_pages or final.page != total:
        raise RuntimeError("Navigation pagination changed; inspect layout before delivery.")
    (SOURCE / "page-map.json").write_text(json.dumps({
        "parts": final.part_pages, "totalPages": final.page,
    }, indent=2) + "\n")
    draft.unlink()
    print(f"Built {OUTPUT}: {final.page} pages; parts {final.part_pages}")


if __name__ == "__main__":
    main()
