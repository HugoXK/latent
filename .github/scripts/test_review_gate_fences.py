"""Pin the review gate's fenced-code-block verdict behaviour (#131).

`parse_verdict()` ignores a verdict that sits inside a fence, so a comment that
quotes "Verdict: PASS at <head>" as an example cannot approve a pull request.
That property is enforced by the `in_fence` branch alone; `test_review_gate.py`
covers the blockquote and withdrawal cases but not a plain fence, so a refactor
could delete the branch and leave every test green.

These cases live in a new file because `test-integrity.sh` refuses changes to a
base test file: a pull request may add gate tests, never edit one.
"""

from __future__ import annotations

import unittest

import review_gate

HEAD = "b" * 40


class FencedVerdictTests(unittest.TestCase):
    def test_a_fenced_pass_is_ignored(self) -> None:
        body = f"An example of the shape:\n\n```\nVerdict: PASS at {HEAD}\n```\n"
        self.assertIsNone(review_gate.parse_verdict(body))

    def test_a_fenced_pass_with_a_language_tag_is_ignored(self) -> None:
        body = f"```text\nVerdict: PASS at {HEAD}\n```\n"
        self.assertIsNone(review_gate.parse_verdict(body))

    def test_an_indented_fence_is_ignored(self) -> None:
        body = f"  ```\n  Verdict: PASS at {HEAD}\n  ```\n"
        self.assertIsNone(review_gate.parse_verdict(body))

    def test_an_unclosed_fence_hides_everything_after_it(self) -> None:
        body = f"Note:\n\n```\nVerdict: PASS at {HEAD}\n"
        self.assertIsNone(review_gate.parse_verdict(body))

    def test_the_same_line_outside_a_fence_still_parses(self) -> None:
        body = f"Verdict: PASS at {HEAD}\n\n```\nVerdict: REQUEST_CHANGES at {HEAD}\n```\n"
        self.assertEqual(review_gate.parse_verdict(body), "PASS")


if __name__ == "__main__":
    unittest.main()
