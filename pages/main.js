const password = document.getElementById("password");
const eye = document.getElementById("eye");
const loginForm = document.getElementById("loginForm");

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

function handleLogin() {
  const userInput = document.getElementById("username").value.trim();
  const pwdInput = password.value.trim();

  const expectedUser = atob("YWRtZW43ODhCT21lbg==");
  const expectedPwd = atob("Ym9kYTMyNHNkanYt");

  if (!userInput || !pwdInput) {
    showInlineError("يرجى إدخال اسم المستخدم وكلمة المرور.");
    return;
  }

  if (userInput === expectedUser && pwdInput === expectedPwd) {
    window.location.href = "shacksf.html";
    return;
  }

  showInlineError("اسم المستخدم أو كلمة المرور غير صحيحة.");
}

if (loginForm) {
  loginForm.addEventListener("submit", (event) => {
    event.preventDefault();
    handleLogin();
  });
}
