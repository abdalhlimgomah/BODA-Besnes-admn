const password = document.getElementById("password");
const eye = document.getElementById("eye");
const loginForm = document.getElementById("loginForm");

const USER_HASH = "8d2654bb9682069b2dea9ffbc637aebd847dad896ea0234b2e1935abf12d8980";
const PASS_HASH = "bbff5fe367f12e5f17a89ed170014d317994476471e47b98c9f5630edb3c119c";
const HASH_SALT = "boda-admin";

function showInlineError(message) {
  let alertNode = document.getElementById("loginError");
  if (!alertNode) {
    alertNode = document.createElement("p");
    alertNode.id = "loginError";
    alertNode.style.cssText = "color:#b42318;font-weight:700;font-size:13px;margin:6px 0 0;";
    loginForm.appendChild(alertNode);
  }
  alertNode.textContent = message;
}

function clearInlineError() {
  const alertNode = document.getElementById("loginError");
  if (alertNode) {
    alertNode.textContent = "";
  }
}

async function sha256(value) {
  const encoded = new TextEncoder().encode(value);
  const hash = await window.crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(hash))
    .map((part) => part.toString(16).padStart(2, "0"))
    .join("");
}

if (eye) {
  eye.addEventListener("click", () => {
    const icon = eye.querySelector("i");
    const show = password.type === "password";
    password.type = show ? "text" : "password";
    if (icon) {
      icon.classList.toggle("fa-eye", !show);
      icon.classList.toggle("fa-eye-slash", show);
    }
  });
}

async function handleLogin() {
  const userInput = document.getElementById("username").value.trim();
  const pwdInput = password.value.trim();

  if (!userInput || !pwdInput) {
    showInlineError("يرجى إدخال اسم المستخدم وكلمة المرور.");
    return;
  }

  const [enteredUserHash, enteredPassHash] = await Promise.all([
    sha256(`u|${userInput}|${HASH_SALT}`),
    sha256(`p|${pwdInput}|${HASH_SALT}`),
  ]);

  if (enteredUserHash === USER_HASH && enteredPassHash === PASS_HASH) {
    if (window.adminAuth?.createSession) {
      window.adminAuth.createSession();
    }
    window.location.replace("shacksf.html");
    return;
  }

  showInlineError("اسم المستخدم أو كلمة المرور غير صحيحة.");
}

if (loginForm) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearInlineError();
    await handleLogin();
  });
}
