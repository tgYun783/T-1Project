# -*- coding: utf-8 -*-
"""docs/problem.yaml 가채점기 v3 (기획 30점 만점, 대시보드 '기획' 점수와 같은 눈금).

사용법:
    python score.py <problem.yaml 경로>

v2는 대시보드의 기획 점수(10/29 17:00 ~ 10/30 05:00)와 그때 main의 problem.yaml을 맞춰 보고(backtest.py) 배점을 정했다.
v3(2026-10-30 07:00 이후)은 13개 시점으로 다시 맞추며 팀 밖 인터뷰(P8)·본문 미결 표시(P9)·해법 범위 정리(S6)를 넣고
features↔명세 일치(F4) 배점을 올렸다. SUBMISSION_CHECK.md의 형식 요건(features ID 등)은 점수에 넣지 않고
통과/실패 점검(C#)으로 따로 보인다(데이터상 점수와 함께 움직이지 않았다).
공식 채점표가 아니다. 대시보드가 실제로 무엇을 보는지는 확인할 수 없다.

결과는 scorecard.md에 쓰고, 점수 기록은 history.csv에 쌓는다.
이 스크립트는 problem.yaml을 고치지 않는다. 무엇이 비었는지만 알려 준다.
"""
import csv
import datetime as dt
import hashlib
import os
import re
import sys

import yaml

HERE = os.path.dirname(os.path.abspath(__file__))

# 번호 바로 뒤에 한글 조사가 붙어도("S3의") 인용으로 본다.
CITE_RE = re.compile(r"(?<![A-Za-z0-9])[SE]\d+(?!\d)|가설|추정|\(사례")
# "흐름 S5"처럼 scenarios.yaml 흐름 번호로 쓴 것은 출처 인용으로 세지 않는다.
S_RE = re.compile(r"(?<![A-Za-z0-9])(?<!흐름 )S\d+(?!\d)")
NUM_RE = re.compile(r"\d[\d,.]*\s*(%|명|개사|개|회|시간|분|원|배)")
OBSERVABLE_RE = re.compile(r"보인다|보이고|보이며|저장|표시|열린다|열리고|유지|추가된다|바뀐|나온다")
DRAFT_RE = re.compile(r"\(팀 초안|\(초안|팀 확인 필요")
PENDING_RE = re.compile(r"학생 답 대기|팀 확인 필요|팀 결정 대기")
PENDING_BODY_RE = re.compile(r"학생 답 대기|팀 확인 필요|팀 결정 대기|값은 아직 없음|확인 안 됨")
# 칸끼리 초점이 어긋났다고 파일 스스로 적은 말. 19:00→20:00(-4.1)에 이런 주석이 있었다.
MISMATCH_RE = re.compile(r"초점에 맞춰 고치지 않|어긋|표현이 달라|맞출지 정해야|서로 맞지 않")
# 근본 문제·원인 사슬에 해법이 원인으로 들어간 말. 23:00 five_whys("스캐너 도구를 사용하지 않기 때문")에 있었다.
SOLUTION_AS_CAUSE_RE = re.compile(r"도구를 사용하지 않|기능이 없어서|서비스를 쓰지 않|단계가 없")
SCOPE_RE = re.compile(r"2차|\(확장\)|확장 대상|^\s*회사\s*$", re.M)
SELF_WORDS = ["우리 서비스", "우리 앱", "우리 기능", "우리 해법"]


def strings(node):
    if node is None:
        return []
    if isinstance(node, str):
        return [node]
    if isinstance(node, dict):
        return [s for v in node.values() for s in strings(v)]
    if isinstance(node, list):
        return [s for v in node for s in strings(v)]
    return [str(node)]


def text(node):
    return "\n".join(strings(node))


def paragraphs(s):
    out, cur = [], []
    for line in s.splitlines():
        if not line.strip() or line.lstrip().startswith("- "):
            if cur:
                out.append("\n".join(cur))
            cur = [line] if line.strip() else []
        else:
            cur.append(line)
    if cur:
        out.append("\n".join(cur))
    return [p for p in out if p.strip()]


def filled(v):
    return v is not None and v != "" and v != []


def path_names(d):
    names = []
    for p in d.get("solution_paths") or []:
        if p and p.get("path"):
            first = re.sub(r"\(.*?\)", "", str(p["path"]).strip().splitlines()[0]).strip()
            if first:
                names.append(first)
    return names


class Card:
    def __init__(self):
        self.items = []
        # 점수에 넣지 않는 통과/실패 점검(제출 점검 형식 등). (id, 내용, 통과 여부, 메모)
        self.checks = []

    def add(self, iid, group, name, got, full, note="", where=""):
        got = max(0.0, min(float(full), round(float(got), 1)))
        self.items.append(dict(id=iid, group=group, name=name, got=got, full=full, note=note, where=where))

    def total(self, group=None):
        return sum(i["got"] for i in self.items if group is None or i["group"] == group)


def score_text(raw):
    card = Card()
    try:
        d = yaml.safe_load(raw) or {}
    except yaml.YAMLError as e:
        card.add("0", "문제 정의", "YAML 문법", 0, 0, f"파싱 실패: {e}")
        return card
    canvas = d.get("canvas") or {}
    impact = canvas.get("impact") or {}
    alts = canvas.get("alternatives") or []
    lines = raw.splitlines()
    G1, G2, G3 = "문제 정의", "솔루션", "기능 명세"

    # ================= 문제 정의 (15) =================
    req = {"statement": d.get("statement"), "context": canvas.get("context"), "customer": canvas.get("customer"),
           "root_problem": canvas.get("root_problem"), "impact.feeling": impact.get("feeling"),
           "impact.measurable": impact.get("measurable"), "alternatives": alts}
    empty = [k for k, v in req.items() if not filled(v)]
    card.add("P0", G1, "statement·캔버스 ①~⑥이 모두 채워짐", 2 * (1 - len(empty) / len(req)), 2,
             ("비어 있음: " + ", ".join(empty)) if empty else "")
    # 19:00→20:00(-4.1)에 근본 문제가 "(가설)"로 바뀌었고 21:00까지 낮게 유지됐다.
    hyp = [k for k in ("statement", "root_problem") if re.search(r"\(가설|가설\)|아직 확인 안 됨",
           str(d.get("statement") if k == "statement" else canvas.get("root_problem") or ""))]
    card.add("P7", G1, "근본 문제·statement가 확인된 사실로 서술됨(가설 표시 없음)", 2 - 1 * len(hyp), 2,
             ("가설로 표시된 칸: " + ", ".join(hyp)) if hyp else "")
    st = " ".join(str(d.get("statement") or "").split())
    pts, why = 0, []
    if re.search(r"다\.?$", st):
        pts += 1.5
    else:
        why.append("문장이 '~다'로 끝나지 않음(명사구 '…하는 문제' 형태면 감점)")
    if "지만" in st:
        pts += 1
    else:
        why.append("⑤현재 대안·⑥단점 절('지금은 …지만, …')이 없음")
    if st and not DRAFT_RE.search(st):
        pts += 0.5
    elif st:
        why.append("초안 표시가 남아 있음")
    if not st:
        pts, why = 0, ["statement 비어 있음"]
    card.add("P1", G1, "statement가 ②①③④⑤⑥을 담은 완결 문장", pts, 3, "; ".join(why))

    mm = [f"{n}행: {ln.strip()[:60]}" for n, ln in enumerate(lines, 1) if MISMATCH_RE.search(ln)]
    card.add("P2", G1, "칸끼리 초점이 맞음(파일에 '어긋남·표현이 다름' 표시 없음, 1줄당 -0.5)",
             1 - 0.5 * len(mm), 1, f"어긋남 표시 {len(mm)}줄" if mm else "", "<br>".join(mm))

    checked = {"statement": d.get("statement"), "canvas": canvas, "five_whys": d.get("five_whys"),
               "solution_paths.reason": [p.get("reason") for p in d.get("solution_paths") or []],
               "insight": d.get("insight")}
    uncited = []
    for sec, node in checked.items():
        for s in strings(node):
            for para in paragraphs(s):
                if NUM_RE.search(para) and not CITE_RE.search(para):
                    uncited.append(f"[{sec}] " + " ".join(para.split())[:70] + "…")
    card.add("P3", G1, "수치마다 출처([S#]/[E#]) 또는 가설·추정 표시(1곳당 -0.75)", 1.5 - 0.75 * len(uncited), 1.5,
             f"출처 없는 수치 {len(uncited)}곳" if uncited else "", "<br>".join(uncited))

    exps = d.get("experiences") or []
    full_exp = [e for e in exps if all(filled(e.get(k)) for k in ("when", "what_happened", "workaround", "feeling", "quote", "source"))]
    holes = [f"{e.get('id')}.{k}" for e in exps for k in ("when", "what_happened", "workaround", "feeling", "quote", "source") if not filled(e.get(k))]
    exp_pend = sum(1 for ln in raw.split("\nsources:")[0].split("\nexperiences:")[-1].splitlines() if PENDING_RE.search(ln)) if "\nexperiences:" in raw else 0
    pts = min(1.0, len(full_exp) / 2) + (1.0 if exps and exp_pend == 0 else max(0.0, 1 - 0.25 * exp_pend) if exps else 0)
    card.add("P4", G1, "실제 경험 2개 이상, 6칸 다 채우고 '학생 답 대기' 없음", pts / 2, 1,
             "; ".join(x for x in [("빈칸: " + ", ".join(holes)) if holes else "",
                                    f"experiences의 대기 표시 {exp_pend}줄" if exp_pend else "",
                                    "experiences 없음" if not exps else ""] if x))

    sources = d.get("sources") or []
    sids = {s.get("id") for s in sources if s}
    cited = set(S_RE.findall(text({k: v for k, v in d.items() if k != "sources"})))
    dangling = sorted(cited - sids)
    weak = [s.get("id") for s in sources if not (str(s.get("url", "")).startswith("https://") and filled(s.get("title")) and filled(s.get("claim")))]
    pts = min(1.0, len(sources) / 5) - 0.5 * len(dangling) - 0.25 * len(weak)
    card.add("P5", G1, "공개 자료 5개 이상, 번호·url·claim이 맞음", pts, 1,
             "; ".join(x for x in [f"자료 {len(sources)}개" if len(sources) < 5 else "",
                                    ("sources에 없는 번호: " + ", ".join(dangling)) if dangling else "",
                                    ("url·title·claim 빠짐: " + ", ".join(weak)) if weak else ""] if x))

    cust = str(canvas.get("customer") or "")
    root = text({"root_problem": canvas.get("root_problem"), "five_whys": d.get("five_whys")})
    prob_txt = text({"statement": d.get("statement"), "context": canvas.get("context"), "customer": cust,
                     "root_problem": canvas.get("root_problem"), "impact": impact})
    issues = []
    if SCOPE_RE.search(cust):
        issues.append("고객 칸에 2차 고객·확장 대상이 있음")
    sol = [w for w in path_names(d) + SELF_WORDS if w and w in prob_txt]
    if sol or SOLUTION_AS_CAUSE_RE.search(root):
        issues.append("문제·원인 칸에 해법이 원인처럼 들어감" + (f"({', '.join(sol)})" if sol else ""))
    card.add("P6", G1, "고객 한 집단에 집중하고, 문제를 해법에서 거꾸로 만들지 않음", 2 - 1 * len(issues), 2, "; ".join(issues))

    # v3: 01:59(+2.4)에 팀 밖 인터뷰 E4가 처음 들어왔다. 팀원·지인 전달 사례만으로는 근거가 좁다.
    outside = [e.get("id") for e in exps if "팀 밖" in str(e.get("source", ""))]
    card.add("P8", G1, "팀 밖 사람을 직접 인터뷰한 경험 2개 이상", min(1.0, len(outside) / 2) * 0.5, 0.5,
             f"팀 밖 인터뷰 {len(outside)}개({', '.join(outside) or '없음'})" if len(outside) < 2 else "")
    # v3: 본문(주석 제외)에 남은 미결 표시. 03:58~04:59에 13~14개로 늘었을 때 점수가 멈췄고, 06:59에 11개로 줄며 +1.0.
    # sources의 claim은 원문 설명이라 뺀다("동료 심사 여부는 확인 안 됨" 같은 자료 설명).
    pend_body = [s for s in strings({k: v for k, v in d.items() if k != "sources"}) for _ in PENDING_BODY_RE.findall(s)]
    card.add("P9", G1, "본문에 미결 표시(학생 답 대기·팀 결정 대기·값은 아직 없음 등) 없음(1개당 -0.1)",
             0.5 - 0.1 * len(pend_body), 0.5, f"미결 표시 {len(pend_body)}개" if pend_body else "")

    # ================= 솔루션 (8) =================
    paths = d.get("solution_paths") or []
    chosen = [p for p in paths if (p or {}).get("status") == "chosen"]
    card.add("S1", G2, "고른 해법(chosen)이 있음", 1.5 if chosen else 0, 1.5, "" if chosen else "solution_paths에 chosen 없음")
    draft = [i + 1 for i, p in enumerate(chosen) if not filled(p.get("reason")) or DRAFT_RE.search(str(p.get("reason")))]
    card.add("S2", G2, "chosen 해법마다 근거 있는 reason(초안 표시 없음)",
             1 * (1 - len(draft) / len(chosen)) if chosen else 0, 1,
             ("초안·빈칸 reason: " + ", ".join(f"{n}번" for n in draft)) if draft else "")
    whys = d.get("five_whys") or {}
    circ = SOLUTION_AS_CAUSE_RE.search(text(whys)) or any(w in text(whys) for w in path_names(d))
    card.add("S3", G2, "five_whys가 채워졌고 해법을 원인으로 쓰지 않음", (1 if filled(whys.get("whys")) or filled(whys.get("symptom")) else 0) - (1 if circ else 0), 1,
             "원인 사슬에 해법이 들어감" if circ else ("five_whys 비어 있음" if not filled(whys.get("symptom")) else ""))
    no_why = [f"A{i+1}" for i, a in enumerate(alts) if not filled((a or {}).get("why_ours"))]
    card.add("S4", G2, "대안마다 why_ours(이 해법이어야 하는 이유)", 1.5 * (1 - len(no_why) / len(alts)) if alts else 0, 1.5,
             ("why_ours 빈칸: " + ", ".join(no_why)) if no_why else "")
    ins = d.get("insight") or {}
    miss = [k for k in ("claim", "evidence", "design_decision") if not filled(ins.get(k))]
    card.add("S5", G2, "insight 3칸(claim·evidence·design_decision)", 1.5 * (1 - len(miss) / 3), 1.5,
             ("빈칸: " + ", ".join(miss)) if miss else "")
    # v3: 06:59(+1.0)에 보류였던 경로 3을 지워 고른 해법만 남겼다. 고르지 않은 경로가 남으면 초점이 흩어져 보인다.
    others = [f"{i + 1}번({(p or {}).get('status')})" for i, p in enumerate(paths) if (p or {}).get("status") != "chosen"]
    card.add("S6", G2, "해법 범위가 정리됨(고르지 않은 보류·기각 경로가 남지 않음, 1개당 -0.75)",
             1.5 - 0.75 * len(others), 1.5, ("남은 경로: " + ", ".join(others)) if others else "")

    # ================= 기능 명세 (7) =================
    feats = d.get("features") or []
    fh = [f"{f.get('id')}.{k}" for f in feats for k in ("id", "name", "input", "output", "done") if not filled(f.get(k))]
    card.add("F1", G3, "features가 있고 기능마다 name·input·output·done", (3.5 if not fh else 2.75) if feats else 0, 3.5,
             "features 없음" if not feats else (("빈칸: " + ", ".join(fh)) if fh else ""))
    vague = [f.get("id") for f in feats if not OBSERVABLE_RE.search(str(f.get("done", "")))]
    card.add("F2", G3, "done이 화면에서 확인할 결과", (1 - len(vague) / len(feats)) if feats else 0, 1,
             ("관찰할 결과가 안 보이는 done: " + ", ".join(vague)) if vague else "")
    login = any("로그인" in str(f.get("name", "")) for f in feats)
    card.add("F3", G3, "회원가입·로그인 기능 포함", 0.5 if login else 0, 0.5, "" if login else "features에 로그인 없음")
    # 대시보드는 features를 읽는다. functional_spec 같은 다른 키에만 있는 현재 범위는 반영되지 않을 수 있다.
    fs = d.get("functional_spec") or {}
    reqs = fs.get("requirements") or []
    fnames = " ".join(str(f.get("name", "")) for f in feats)
    deferred_basis = {str(x.get("basis")) for x in (fs.get("deferred") or []) if isinstance(x, dict)}
    if reqs:
        hit = [r.get("id") for r in reqs if str(r.get("name", "")).split("(")[0].strip() in fnames]
        stale = [f.get("id") for f in feats if f.get("id") in deferred_basis]
        pts = len(hit) / len(reqs) - 0.1 * len(stale)
        note = f"features에 있는 요구사항 {len(hit)}/{len(reqs)}개"
        if stale:
            note += f"; 보류(deferred)한 기능이 features에 남음: {', '.join(stale)}"
        # v3: 05:55(+3.6)에 features를 functional_spec과 맞춘 것이 가장 큰 오름이었다. 배점 1 → 2.5.
        card.add("F4", G3, "features가 현재 범위(functional_spec·보류 결정)와 같음", 2.5 * pts, 2.5, note)
    else:
        card.add("F4", G3, "features가 현재 범위(functional_spec·보류 결정)와 같음", 2.5 if feats else 0, 2.5,
                 "" if feats else "features 없음")
    # v3: 제출 점검(SUBMISSION_CHECK.md 2절) 형식. ID는 F1, F2… 중복 없이, 최대 25개.
    # 데이터로는 R번호였던 05:55·06:59에도 점수가 올라 점수에는 넣지 않고 통과/실패로만 본다.
    ids = [str(f.get("id")) for f in feats]
    bad = [i for i in ids if not re.fullmatch(r"F\d+", i)]
    fmt = []
    if bad:
        fmt.append(f"F# 형식이 아닌 ID {len(bad)}개({', '.join(bad[:3])}…)")
    if len(set(ids)) != len(ids):
        fmt.append("중복 ID")
    if len(ids) > 25:
        fmt.append(f"기능 {len(ids)}개(최대 25)")
    card.checks.append(("C1", "features ID가 F1, F2… 형식·중복 없음·25개 이하(SUBMISSION_CHECK 2절)",
                        bool(feats) and not fmt, "; ".join(fmt) if feats else "features 없음"))
    # v3: 근거(basis)·본문이 가리키는 번호가 파일 안에 실제로 있는지. 01:59에 생긴 뒤에도 점수가 올라 점수에는 넣지 않는다.
    body_txt = text(d)
    known = {str(x.get("id")) for sec in ("experiences", "sources", "features") for x in (d.get(sec) or []) if isinstance(x, dict)}
    known |= {str(x.get("id")) for x in (fs.get("requirements") or []) + (fs.get("constraints") or []) if isinstance(x, dict)}
    broken = sorted(set(re.findall(r"insight \d", body_txt)) | set(re.findall(r"E\d+ Q\d+", body_txt)))
    broken += sorted({r for r in re.findall(r"(?<![A-Za-z0-9])[ERC]\d+(?!\d)", body_txt) if r not in known})
    card.checks.append(("C2", "근거 표시가 파일 안의 실제 칸·번호를 가리킴(insight 2·E4 Q2처럼 없는 번호 없음)",
                        not broken, f"찾을 수 없는 근거 표시 {len(broken)}종: {', '.join(broken)}" if broken else ""))
    return card


def predict(total):
    """backtest.py가 만든 calib.json으로 대시보드 기획 점수를 예상한다."""
    import json
    p = os.path.join(HERE, "calib.json")
    if not os.path.exists(p):
        return None
    c = json.load(open(p))
    return c["a"] + c["b"] * total, c["mae"]


def write_report(card, path, sha):
    total = card.total()
    pr = predict(total)
    hist = os.path.join(HERE, "history.csv")
    prev = None
    if os.path.exists(hist):
        rows = list(csv.reader(open(hist, encoding="utf-8")))
        if len(rows) > 1:
            prev = rows[-1]
    now = dt.datetime.now().strftime("%Y-%m-%d %H:%M")
    new_file = not os.path.exists(hist)
    with open(hist, "a", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        if new_file:
            w.writerow(["time", "file_sha", "problem15", "solution8", "features7", "total30", "dashboard_pred"])
        w.writerow([now, sha, f"{card.total('문제 정의'):.1f}", f"{card.total('솔루션'):.1f}",
                    f"{card.total('기능 명세'):.1f}", f"{total:.1f}", f"{pr[0]:.1f}" if pr else ""])
    delta = ""
    if prev:
        diff = total - float(prev[5])
        delta = f" (지난번 {float(prev[5]):.1f} → {'+' if diff >= 0 else ''}{diff:.1f})"

    out = ["# problem.yaml 가채점 결과 (v3)\n",
           f"- 채점 시각: {now}  ·  파일 지문: `{sha}`",
           f"- **형식 가채점 {total:.1f} / 30**{delta}",
           f"- 문제 정의 {card.total('문제 정의'):.1f}/14.5  ·  솔루션 {card.total('솔루션'):.1f}/8  ·  기능 명세 {card.total('기능 명세'):.1f}/7.5"]
    if pr:
        out.append(f"- **대시보드 기획 점수 예상 약 {pr[0]:.1f} / 30** (지난 시간별 점수로 맞춘 값, 평균 오차 ±{pr[1]:.1f})")
        out.append(f"- 형식 가채점을 30점 다 채워도 예상은 약 {predict(30)[0]:.1f}점이다. 05:55부터 실제 점수가 예상보다 1~2점 높았다. "
                   "그 차이는 대시보드가 내용의 질을 보는 영역이라 이 채점기로는 알 수 없다(가채점표.md 「대조 결과」).")
    out += ["", "## 점수 올리기 우선순위 (잃은 점수 큰 순)\n"]
    losses = sorted([i for i in card.items if i["got"] < i["full"]], key=lambda i: i["full"] - i["got"], reverse=True)
    for n, i in enumerate(losses[:6], 1):
        out.append(f"{n}. **{i['id']} {i['name']}**: -{i['full'] - i['got']:.1f}점. {i['note']}")
    if card.checks:
        out += ["", "## 제출 형식 점검 (점수에 넣지 않음)\n"]
        out += [f"- {'통과' if ok else '**실패**'} {cid} {name}" + (f": {note}" if note else "") for cid, name, ok, note in card.checks]
    out += ["", "## 항목별 점수\n", "| 묶음 | 항목 | 내용 | 점수 | 메모 |", "|---|---|---|---|---|"]
    for i in card.items:
        out.append(f"| {i['group']} | {i['id']} | {i['name']} | {i['got']:.1f} / {i['full']} | {(i['note'] or '').replace('|', '/')} |")
    details = [i for i in card.items if i["where"]]
    if details:
        out.append("\n## 고칠 곳 목록\n")
        for i in details:
            out.append(f"### {i['id']} {i['name']}\n")
            out += [f"- {w}" for w in i["where"].split("<br>")]
            out.append("")
    open(os.path.join(HERE, "scorecard.md"), "w", encoding="utf-8").write("\n".join(out))
    return total, delta, losses


def main():
    if len(sys.argv) < 2:
        print("사용법: python score.py <docs/problem.yaml 경로>")
        sys.exit(1)
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    raw = open(sys.argv[1], encoding="utf-8").read()
    sha = hashlib.sha1(raw.encode("utf-8")).hexdigest()[:10]
    card = score_text(raw)
    total, delta, losses = write_report(card, sys.argv[1], sha)
    print(f"형식 가채점 {total:.1f} / 30{delta}")
    pr = predict(total)
    if pr:
        print(f"대시보드 기획 점수 예상 약 {pr[0]:.1f} / 30 (±{pr[1]:.1f})")
    for i in losses[:3]:
        print(f"  -{i['full'] - i['got']:.1f}  {i['id']} {i['name']}")
    for cid, name, ok, _note in card.checks:
        if not ok:
            print(f"  점검 실패  {cid} {name}")
    print("자세한 결과: scorecard.md (score.py와 같은 폴더)")


if __name__ == "__main__":
    main()
