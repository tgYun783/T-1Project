# -*- coding: utf-8 -*-
"""대시보드 시간별 기획 점수와 가채점(score.py)을 맞춰 보는 스크립트.

사용법: python backtest.py <서비스 저장소 경로>
대시보드가 채점한 커밋의 docs/problem.yaml을 꺼내 가채점하고, 대시보드 점수와 나란히 보여 준다.
대시보드에 새 점수가 찍히면 DASH에 한 줄 추가하고 다시 돌린다.
"""
import os
import subprocess
import sys

import yaml

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import score as S  # noqa: E402

# 대시보드 「점수 → 채점된 커밋」 표의 값(커밋, 커밋 시각, 기획 /30, 구현 /20). 대시보드는 커밋마다 채점한다.
# 2026-10-30 화면 캡처로 교체(이전에는 그래프 눈금으로 읽은 정시 값이었다).
DASH = [
    ("df00cc1", "2026-10-29 16:57", 13.0, 0.0),
    ("14a72b8", "2026-10-29 19:46", 8.8, 0.0),
    ("8e9414a", "2026-10-29 20:31", 8.6, 0.0),
    ("ddb52d2", "2026-10-29 21:53", 7.4, 0.0),
    ("1e66eea", "2026-10-29 22:59", 12.3, 0.0),
    ("fada0d3", "2026-10-29 23:58", 12.6, 0.0),
    ("83906f1", "2026-10-30 00:45", 15.0, 3.5),
    ("b2a2cb8", "2026-10-30 01:59", 17.4, 3.5),
    ("810d01c", "2026-10-30 02:58", 17.2, 3.5),
    ("2595e2f", "2026-10-30 03:58", 17.4, 3.5),
    ("d352c30", "2026-10-30 04:59", 16.9, 2.7),
    ("97e4bc6", "2026-10-30 05:55", 20.5, 3.0),
    # 07:00 채점 화면 캡처의 값. 채점된 커밋은 07:00 직전 main으로 봤다(d0a8ea0과 problem.yaml 같음).
    ("54cd818", "2026-10-30 06:59", 21.5, 14.1),
]


def git(repo, *args):
    return subprocess.run(["git", "-C", repo, *args], capture_output=True, text=True, encoding="utf-8").stdout


def changed(d, p):
    keys = []
    for k in sorted(set(d) | set(p)):
        if k == "canvas":
            for ck in sorted(set(d.get("canvas") or {}) | set(p.get("canvas") or {})):
                if (d.get("canvas") or {}).get(ck) != (p.get("canvas") or {}).get(ck):
                    keys.append("canvas." + ck)
        elif d.get(k) != p.get(k):
            keys.append(k)
    return keys


def main():
    repo = sys.argv[1]
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    print("시각         commit   대시보드  가채점  차이 | 문제/14.5 솔루션/8 기능/7.5 | 대시보드 변화 · 가채점 변화 · 바뀐 칸")
    prev = None
    errs = []
    for sha, t, plan, _impl in DASH:
        raw = git(repo, "show", f"{sha}:docs/problem.yaml")
        card = S.score_text(raw)
        g = card.total()
        d = yaml.safe_load(raw) or {}
        errs.append(g - plan)
        tail = ""
        if prev:
            tail = f"{plan - prev[0]:+5.1f} · {g - prev[1]:+5.1f} · {', '.join(changed(d, prev[2])) or '(변화 없음)'}"
        print(f"{t[5:]}  {sha[:7]}  {plan:6.1f}  {g:6.1f}  {g - plan:+5.1f} | {card.total('문제 정의'):6.1f} {card.total('솔루션'):7.1f} {card.total('기능 명세'):5.1f}  | {tail}")
        prev = (plan, g, d)
    raw = [e + p for e, (_, _t, p, _i) in zip(errs, DASH)]
    dash = [p for _, _t, p, _i in DASH]
    mae = sum(abs(e) for e in errs) / len(errs)
    print(f"\n[가채점 그대로] 평균 차이 {mae:.1f}점, 최대 {max(abs(e) for e in errs):.1f}점")
    # 가채점 → 대시보드 예상 점수: 직선 하나로 맞춘다(예상 = a + b × 가채점).
    n = len(raw)
    mx, my = sum(raw) / n, sum(dash) / n
    b = sum((x - mx) * (y - my) for x, y in zip(raw, dash)) / sum((x - mx) ** 2 for x in raw)
    a = my - b * mx
    pred = [a + b * x for x in raw]
    mae2 = sum(abs(p - y) for p, y in zip(pred, dash)) / n
    print(f"[대시보드 예상 = {a:.2f} + {b:.2f} × 가채점] 평균 차이 {mae2:.1f}점, 최대 {max(abs(p - y) for p, y in zip(pred, dash)):.1f}점")
    same = 0
    for i in range(1, n):
        dd, dp = dash[i] - dash[i - 1], pred[i] - pred[i - 1]
        if (abs(dd) < 0.6 and abs(dp) < 0.6) or dd * dp > 0:
            same += 1
    print(f"오르내림 방향이 맞은 구간 {same}/{n - 1} (0.6점 미만 변화는 '그대로'로 봄)")
    print("커밋     시각   대시보드  예상")
    for (sha, t, p, _i), q in zip(DASH, pred):
        print(f"{sha}  {t[11:]}  {p:6.1f}  {q:6.1f}")
    import json
    json.dump({"a": round(a, 3), "b": round(b, 3), "mae": round(mae2, 2), "points": n},
              open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "calib.json"), "w"))
    print("calib.json에 저장함. score.py가 이 값으로 '대시보드 예상'을 보여 준다.")


if __name__ == "__main__":
    main()
