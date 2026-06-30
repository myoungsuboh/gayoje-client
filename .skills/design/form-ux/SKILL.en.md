---
name: Form UX & Input Patterns
description: A framework-agnostic standard for designing input forms with accessibility and error prevention at the core — always-visible labels, validation timing (onBlur/onSubmit), field-adjacent error display with aria linkage, autocomplete, multi-step, and submission state handling. Not tied to any specific framework. Read this when building a new input form or deciding validation/error-display UX. Keywords: form, input, label, validation timing, aria-describedby, aria-invalid, onBlur, onSubmit, required, autocomplete, multi-step, submitting.
rules:
  - "Always-visible labels: provide a visually persistent label for every input field, and never substitute a placeholder for the label (its context disappears the moment typing begins)."
  - "Validation timing matters: start live validation after the user leaves the field (blur), and do not surface errors during typing (change) so as not to interrupt it. On submit, display all errors at once."
  - "Errors adjacent to the field + programmatically linked: place the error message directly below the field, and programmatically link the field and message (aria-describedby) so screen readers read it. Expose the error state via aria-invalid."
  - "Required items, explicitly: mark required inputs on the label, and explain the meaning of that mark ('* indicates a required field') once somewhere in the form. Provide not only a visual mark but also an assistive-technology mark (such as aria-required)."
  - "Prevent duplicate submission: while submitting, disable the submit button and show progress (loading) to block duplicate submissions."
  - "Framework-neutral: all of the above concepts can be expressed with standard HTML elements and ARIA. A specific framework's binding syntax is merely an implementation detail; the standard is the rules below."
tags:
  - "form"
  - "input"
  - "label"
  - "validation timing"
  - "aria-describedby"
  - "aria-invalid"
  - "onBlur"
  - "onSubmit"
  - "required"
  - "autocomplete"
  - "multi-step"
  - "submitting"
  - "<form"
  - "<input"
  - "<label"
---

# 📝 Form UX & Input Patterns

> Design forms that are accessible and prevent errors. Read this when building a form or deciding how to validate and display errors. This is a framework-agnostic, general-purpose standard, and the principles and rules below are based on standard HTML semantics (semantics and ARIA). For server-side enforcement of validation, see the `forms-validation` (client-side validation aid) and server input validation standards; for accessibility details, also see `accessibility-wcag`.

## 1. Core Principles
- **Always-visible labels**: provide a visually persistent label for every input field, and never substitute a placeholder for the label (its context disappears the moment typing begins).
- **Validation timing matters**: start live validation after the user leaves the field (blur), and do not surface errors during typing (change) so as not to interrupt it. On submit, display all errors at once.
- **Errors adjacent to the field + programmatically linked**: place the error message directly below the field, and programmatically link the field and message (`aria-describedby`) so screen readers read it. Expose the error state via `aria-invalid`.
- **Required items, explicitly**: mark required inputs on the label, and explain the meaning of that mark ("* indicates a required field") once somewhere in the form. Provide not only a visual mark but also an assistive-technology mark (such as `aria-required`).
- **Prevent duplicate submission**: while submitting, disable the submit button and show progress (loading) to block duplicate submissions.
- **Framework-neutral**: all of the above concepts can be expressed with standard HTML elements and ARIA. A specific framework's binding syntax is merely an implementation detail; the standard is the rules below.

## 2. Rules

### 2-1. Labels & Input Fields
Place a visible `<label for>` for each field, and link hints and errors with `aria-describedby`. Use the placeholder only as a supplementary example, not as the label.

```html
<!-- ❌ Forbidden — substituting a placeholder for the label (disappears on typing, losing context) -->
<input type="email" placeholder="이메일" />

<!-- ✅ Recommended — always-visible label + aria linkage -->
<label for="email">
  이메일 <span aria-hidden="true">*</span>
  <span class="sr-only">(필수)</span>
</label>
<input
  id="email"
  type="email"
  autocomplete="email"
  aria-describedby="email-hint email-error"
  aria-invalid="true"
  aria-required="true"
/>
<span id="email-hint" class="hint">예: hello@example.com</span>
<span id="email-error" role="alert" class="error">올바른 이메일 형식을 입력해 주세요.</span>
```

### 2-2. Validation Timing
| Moment | Rule |
|------|------|
| During typing (change) | Do not show errors — disrupts the user |
| Focus loss (blur) | Begin showing errors for that field |
| On submit (submit) | Display all errors at once + move focus to the first error field |
| After fixing an error | Switch that field to live validation on change |

> What to validate (required, length, format, domain rules) and server-side enforcement are out of scope for this skill — follow the `forms-validation` / server input validation standards. Here we only cover "when and how to display."

### 2-3. Enabling autocomplete
Specify the standard `autocomplete` token matching the input's meaning to assist browser autocomplete and autofill.

```html
<input type="text"     autocomplete="name" />
<input type="email"    autocomplete="email" />
<input type="tel"      autocomplete="tel" />
<input type="text"     autocomplete="street-address" />
<input type="password" autocomplete="current-password" />
```

### 2-4. Multi-step Form Patterns
- Show progress (step 1/3 or a progress bar)
- Preserve each step's input values (when returning to a previous step)
- Provide a summary screen before submission
- For long forms, consider per-section Auto-save

### 2-5. Submission State Handling
While submission is in progress, disable the submit button (`disabled`) and convey progress via the button label/indicator. The disabling itself blocks duplicate submission, and the status text communicates that it is in progress.

```html
<!-- ✅ Recommended — disabled during submit prevents duplicate submission + conveys progress -->
<!-- while isSubmitting = true -->
<button type="submit" disabled aria-busy="true">저장 중...</button>

<!-- normally, when isSubmitting = false -->
<button type="submit">저장하기</button>
```

> In a framework, bind the `disabled` attribute and button content to the `isSubmitting` state. For concrete syntax, see the [appendix](#appendix-stack-specific-examples).

## 3. Common Mistakes
- **Using a placeholder instead of a label** → context disappears the moment typing begins.
- **Showing errors from during typing (change)** → disrupts typing. Show from blur.
- **Not linking error messages via aria** → screen readers cannot read the errors. Link with `aria-describedby` + `aria-invalid`.
- **Omitting submit-button disabling** → duplicate submissions occur.
- **Marking required items with a visual symbol only** → assistive-technology users do not know what is required. Expose it via `aria-required` and the like.

## 4. Checklist
- [ ] Does every input have an always-visible label linked via `for`/`aria`?
- [ ] Is validation shown from blur and blocked during typing (change)?
- [ ] Is the error message placed directly below the field and linked via `aria-describedby`/`aria-invalid`?
- [ ] Are required items marked with a visual mark + an assistive-technology mark, with an explanatory note?
- [ ] Is the button disabled during submit and progress shown?
- [ ] Does what-to-validate / server-side enforcement follow the `forms-validation` standard?

## Appendix: Stack-specific Examples

> Below are reference implementation examples. The principles and rules in sections 1–4 above are the standard; the appendix is merely an application thereof. Add examples that fit your team's stack (React/JSX, Angular, plain HTML, etc.) following the same pattern.

### Vue

An example of binding submission state handling (2-5) in Vue. Bind `:disabled` to the `isSubmitting` state and switch the button label with `v-if`/`v-else`.

```html
<!-- ✅ Recommended — disable button during submit + show loading to prevent duplicate submission -->
<button type="submit" :disabled="isSubmitting">
  <span v-if="isSubmitting">저장 중...</span>
  <span v-else>저장하기</span>
</button>
```
