"""Pin the fenced-code-block behaviour of `parse_verdict()`.

The verdict parser ignores a `Verdict:` line inside a fenced block, inside a
blockquote and after a withdrawal marker, so a review that *quotes* an old
verdict cannot score. The blockquote and withdrawal cases are pinned in
`test_review_gate.py`; the fence cases are not, and a refactor that dropped the
`in_fence` toggle would keep every existing test green while making the gate
read a quoted PASS as an approval.

This file adds the missing pins. It is a new file on purpose: `test_review_gate.py`
exists on the base branch and `test-integrity.sh` fails `gate-tests` on any change
to a base-guarded test, which is the guard doing its job rather than an obstacle.
"""

from __future__ import annotations

import unittest

import review_gate

HEAD = "a" * 40
PASS_LINE = f"Verdict: PASS at {HEAD}"


class FencedVerdictTests(unittest.TestCase):
    def test_a_fenced_pass_is_ignored(self) -> None:
        body = f"Here is what I said before:\n\n```\n{PASS_LINE}\n```\n"
        self.assertIsNone(review_gate.parse_verdict(body))

    def test_a_fenced_pass_with_a_language_tag_is_ignored(self) -> None:
        body = f"Quote from the previous review:\n\n```text\n{PASS_LINE}\n```\n"
        self.assertIsNone(review_gate.parse_verdict(body))

    def test_an_indented_fence_is_ignored(self) -> None:
        body = f"Quoted under a list item:\n\n    ```\n    {PASS_LINE}\n    ```\n"
        self.assertIsNone(review_gate.parse_verdict(body))

    def test_an_unclosed_fence_hides_the_rest_of_the_body(self) -> None:
        body = f"A quote that was never closed:\n\n```\n{PASS_LINE}\n"
        self.assertIsNone(review_gate.parse_verdict(body))

    def test_a_blockquoted_pass_is_ignored(self) -> None:
        body = f"> {PASS_LINE}\n\nThat was the earlier verdict."
        self.assertIsNone(review_gate.parse_verdict(body))


class ControlTests(unittest.TestCase):
    def test_a_plain_verdict_still_parses(self) -> None:
        self.assertEqual(review_gate.parse_verdict(PASS_LINE), "PASS")
        self.assertEqual(
            review_gate.parse_verdict(f"Verdict: REQUEST_CHANGES at {HEAD}"),
            "REQUEST_CHANGES",
        )

    def test_a_fence_closes_and_a_later_verdict_still_parses(self) -> None:
        body = (
            "Earlier text, quoted:\n\n"
            f"```\n{PASS_LINE}\n```\n\n"
            "Now my own verdict, which is a request for changes:\n\n"
            f"Verdict: REQUEST_CHANGES at {HEAD}\n"
        )
        self.assertEqual(review_gate.parse_verdict(body), "REQUEST_CHANGES")


if __name__ == "__main__":
    unittest.main()
