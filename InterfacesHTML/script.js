/* ===================== HERO Collins-like ===================== */
const cards = document.querySelectorAll('.collins-container .ui-card');
const prevBtn = document.getElementById('hero-prev');
const nextBtn = document.getElementById('hero-next');
const breadcrumb = document.querySelectorAll('.hero-breadcrumb .breadcrumb-item');
const heroRoot = document.querySelector('.collins-hero');

if (!cards.length) {
  console.warn('No hay cartas en el hero.');
}

let current = 0;
let animating = false;

const mod = (n, m) => ((n % m) + m) % m;
const prevIndex = i => mod(i - 1, cards.length);
const nextIndex = i => mod(i + 1, cards.length);

function applyClasses(center){
  cards.forEach(c => c.className = 'ui-card'); // limpia
  cards[center].classList.add('active');
  cards[prevIndex(center)].classList.add('prev');
  cards[nextIndex(center)].classList.add('next');
}

function updateBreadcrumb(){
  if (!breadcrumb.length) return;
  breadcrumb.forEach((b, i) => b.classList.toggle('active', i === current));
}

function tilt(dir){
  if (!heroRoot) return;
  heroRoot.classList.add(dir === 'right' ? 'tilt-right' : 'tilt-left');
  setTimeout(() => heroRoot.classList.remove('tilt-right','tilt-left'), 500);
}

function show(index, dir){
  if (animating || index === current || index < 0 || index >= cards.length) return;
  animating = true;
  tilt(dir);
  current = index;
  applyClasses(current);
  updateBreadcrumb();
  setTimeout(() => { animating = false; }, 600);
}

/* Auto slide */
let timer = setInterval(() => show(nextIndex(current), 'right'), 4000);
function resetTimer(){
  clearInterval(timer);
  timer = setInterval(() => show(nextIndex(current), 'right'), 4000);
}

/* Flechas */
prevBtn?.addEventListener('click', () => { show(prevIndex(current), 'left'); resetTimer(); });
nextBtn?.addEventListener('click', () => { show(nextIndex(current), 'right'); resetTimer(); });

/* Click en cartas vecinas */
cards.forEach((card, i) => {
  card.addEventListener('click', () => {
    if (card.classList.contains('prev')) { show(i, 'left'); resetTimer(); }
    else if (card.classList.contains('next')) { show(i, 'right'); resetTimer(); }
  });
});

/* Teclado */
document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft')  { prevBtn?.click(); }
  if (e.key === 'ArrowRight') { nextBtn?.click(); }
});

/* Init */
applyClasses(current);
updateBreadcrumb();

/* ===== Menú hamburguesa: abrir/cerrar ===== */
const hamburger = document.getElementById('hamburger');
const sideMenu  = document.getElementById('menu-categorias');
const backdrop  = document.getElementById('menu-backdrop');
const closeBtn  = document.querySelector('.close-menu');

function openMenu(){
  sideMenu.classList.add('open');
  backdrop.classList.add('show');
  document.body.classList.add('menu-open');
  hamburger?.setAttribute('aria-expanded','true');
  sideMenu?.setAttribute('aria-hidden','false');
}
function closeMenu(){
  sideMenu.classList.remove('open');
  backdrop.classList.remove('show');
  document.body.classList.remove('menu-open');
  hamburger?.setAttribute('aria-expanded','false');
  sideMenu?.setAttribute('aria-hidden','true');
}
function toggleMenu(){
  sideMenu.classList.contains('open') ? closeMenu() : openMenu();
}

hamburger?.addEventListener('click', toggleMenu);
hamburger?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleMenu(); }
});

backdrop?.addEventListener('click', closeMenu);
closeBtn?.addEventListener('click', closeMenu);

/* Cerrar con ESC */
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });

/* Cerrar al hacer click en una categoría */
sideMenu?.addEventListener('click', (e) => {
  const link = e.target.closest('.cat-btn');
  if (link) closeMenu();
});


/* ===================== LOGIN ===================== */

document.addEventListener('DOMContentLoaded', () => {
  console.log('Login listo - script cargado');

  const form = document.querySelector('.form');
  const inputs = form.querySelectorAll('input[required]');
  const captcha = form.querySelector('input[type="checkbox"][required]');
  const btn = form.querySelector('.btn');

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    // Validación general de campos requeridos
    let valido = true;
    inputs.forEach(input => {
      if (!input.value.trim()) valido = false;
    });

    // Verificar captcha
    if (!captcha.checked) valido = false;

    if (!valido) {
      mostrarError('Por favor, completá todos los campos y marcá el captcha.');
      return;
    }

    // Deshabilitar botón y mostrar animación de carga
    btn.disabled = true;
    btn.textContent = 'Iniciando sesión...';
    btn.style.opacity = '0.8';

    // Simular carga (como si verificara usuario)
    setTimeout(() => {
      btn.textContent = '✔ Sesión iniciada';
      btn.style.background = '#10B981'; 
      btn.style.borderColor = '#059669';

      // Redirigir después de 1.5 segundos
      setTimeout(() => {
        window.location.href = 'index.html';
      }, 1500);
    }, 1200);
  });

  function mostrarError(mensaje) {
    let error = document.getElementById('login-error');
    if (!error) {
      error = document.createElement('p');
      error.id = 'login-error';
      error.style.color = '#d00000';
      error.style.fontSize = '14px';
      error.style.margin = '4px 0';
      form.insertBefore(error, btn); // antes del botón
    }
    error.textContent = mensaje;
  }
});


/* ===================== REGISTRO ===================== */

document.addEventListener('DOMContentLoaded', () => {
  console.log('Registro listo - script corriendo');

  const form = document.getElementById('registroForm');
  const btn = document.getElementById('submitBtn');
  const captcha = form.querySelector('input[type="checkbox"][required]');
  const inputs = form.querySelectorAll('input[required]');
  const msg = document.getElementById('error-msg');

  if (!form || !btn) {
    console.error('No se encontró el form o el botón. Revisá los IDs.');
    return;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Validación nativa del form
    if (!form.reportValidity()) return;

    // Validar contraseñas iguales
    const pass1 = document.getElementById('password').value.trim();
    const pass2 = document.getElementById('password2').value.trim();

    if (pass1 !== pass2) {
      msg.textContent = 'Las contraseñas no coinciden.';
      msg.classList.add('is-visible');
      return;
    } else {
      msg.classList.remove('is-visible');
    }

    // Deshabilitar botón y mostrar carga
    btn.disabled = true;
    btn.textContent = 'Creando cuenta...';
    btn.style.opacity = '0.8';

    // Simular registro
    await new Promise((res) => setTimeout(res, 1200));

    // Efecto de éxito (igual que login)
    btn.textContent = '✔ ¡Registro exitoso!';
    btn.style.background = '#10B981'; // verde
    btn.style.borderColor = '#059669';

    // Redirigir al login
    setTimeout(() => {
      window.location.href = 'login.html';
    }, 1500);
  });
});

/*==============================================================================*/

document.addEventListener('DOMContentLoaded', () => {
  console.log('Registro listo - script corriendo');

  const form = document.getElementById('registroForm');
  const btn = document.getElementById('submitBtn');
  const captcha = form.querySelector('input[type="checkbox"][required]');
  const inputs = form.querySelectorAll('input[required]');
  const msg = document.getElementById('error-msg');

  if (!form || !btn) {
    console.error('No se encontró el form o el botón. Revisá los IDs.');
    return;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Validación nativa del form
    if (!form.reportValidity()) return;

    // Validar contraseñas iguales
    const pass1 = document.getElementById('password').value.trim();
    const pass2 = document.getElementById('password2').value.trim();

    if (pass1 !== pass2) {
      msg.textContent = 'Las contraseñas no coinciden.';
      msg.classList.add('is-visible');
      return;
    } else {
      msg.classList.remove('is-visible');
    }

    // Deshabilitar botón y mostrar carga
    btn.disabled = true;
    btn.textContent = 'Creando cuenta...';
    btn.style.opacity = '0.8';

    // Simular registro
    await new Promise((res) => setTimeout(res, 1200));

    // Efecto de éxito (igual que login)
    btn.textContent = '✔ ¡Registro exitoso!';
    btn.style.background = '#10B981'; // verde
    btn.style.borderColor = '#059669';

    // Redirigir al login
    setTimeout(() => {
      window.location.href = 'login.html';
    }, 1500);
  });
});


/*==============================================================================*/

document.addEventListener('DOMContentLoaded', () => {
  console.log('Login listo - script cargado');

  const form = document.querySelector('.form');
  const inputs = form.querySelectorAll('input[required]');
  const captcha = form.querySelector('input[type="checkbox"][required]');
  const btn = form.querySelector('.btn');

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    // Validación general de campos requeridos
    let valido = true;
    inputs.forEach(input => {
      if (!input.value.trim()) valido = false;
    });

    // Verificar captcha
    if (!captcha.checked) valido = false;

    if (!valido) {
      mostrarError('Por favor, completá todos los campos y marcá el captcha.');
      return;
    }

    // Deshabilitar botón y mostrar animación de carga
    btn.disabled = true;
    btn.textContent = 'Iniciando sesión...';
    btn.style.opacity = '0.8';

    // Simular carga (como si verificara usuario)
    setTimeout(() => {
      btn.textContent = '✔ Sesión iniciada';
      btn.style.background = '#10B981'; 
      btn.style.borderColor = '#059669';

      // Redirigir después de 1.5 segundos
      setTimeout(() => {
        window.location.href = 'index.html';
      }, 1500);
    }, 1200);
  });

  function mostrarError(mensaje) {
    let error = document.getElementById('login-error');
    if (!error) {
      error = document.createElement('p');
      error.id = 'login-error';
      error.style.color = '#d00000';
      error.style.fontSize = '14px';
      error.style.margin = '4px 0';
      form.insertBefore(error, btn); // antes del botón
    }
    error.textContent = mensaje;
  }
});

/* ===================== LOADER ===================== */

// Espera a que todo el contenido del DOM esté cargado antes de ejecutar
window.addEventListener('DOMContentLoaded', () => {

  // Elementos del DOM
  const pantallaCarga = document.getElementById('loader');     // Pantalla de carga
  const contenidoPagina = document.getElementById('content');  // Contenido principal de la página
  const textoPorcentaje = document.getElementById('progress'); // Texto que muestra el porcentaje de carga

  let duracionTotal = 5000; // Duración total de la animación en milisegundos (5 segundos)
  let momentoInicio = null; // Momento inicial de la animación

  // Función de animación que se llama en cada frame
  function animar(marcaTiempo) {
    if (!momentoInicio) momentoInicio = marcaTiempo;  // Guardar el timestamp inicial la primera vez
    let tiempoTranscurrido = marcaTiempo - momentoInicio; // Tiempo transcurrido desde el inicio

    // Calcular porcentaje de carga
    let porcentajeActual = Math.min(Math.floor((tiempoTranscurrido / duracionTotal) * 100), 100);
    textoPorcentaje.textContent = porcentajeActual + '%'; // Mostrar porcentaje en el HTML

    if (tiempoTranscurrido < duracionTotal) {
      // Seguir animando si no terminó la duración
      requestAnimationFrame(animar);
    } else {
      // Ocultar la pantalla de carga y mostrar el contenido cuando termina
      pantallaCarga.style.display = 'none';
      contenidoPagina.style.display = 'block';
    }
  }

  // Iniciar la animación
  requestAnimationFrame(animar);
});

/* ===================== CARUSELES VERTICALES - saltos de 5 ===================== */
document.addEventListener('DOMContentLoaded', () => {
  const CARDS_PER_STEP = 5;

  const carousels = document.querySelectorAll('.carrusel-cards-verticales');
  carousels.forEach((carousel) => {
    const section = carousel.querySelector('section');
    if (!section) return;
    const items = Array.from(section.querySelectorAll('.card-frame'));
    if (!items.length) return;

    // flechas dentro de ESTE carrusel
    const prevBtn = carousel.querySelector('.cards-flecha.izq');
    const nextBtn = carousel.querySelector('.cards-flecha.der');
    const breadcrumbContainer = carousel.querySelector('.carrusel-breadcrumb');

    let firstIndex = 0; // índice del primer elemento visible
    section.style.transform = 'translateX(0px)';
    section.style.transition = section.style.transition || 'transform 0.45s ease';

    // calcular cantidad de grupos (cada grupo muestra CARDS_PER_STEP)
    function groupCountFor(total) {
      return Math.max(1, Math.ceil(total / CARDS_PER_STEP));
    }

    // asegurar que el breadcrumb tenga la cantidad correcta de puntos
    function ensureBreadcrumb() {
      if (!breadcrumbContainer) return;
      const totalGroups = groupCountFor(items.length);
      // limpiar existentes si son más
      while (breadcrumbContainer.children.length > totalGroups) {
        breadcrumbContainer.removeChild(breadcrumbContainer.lastChild);
      }
      // añadir faltantes
      while (breadcrumbContainer.children.length < totalGroups) {
        const span = document.createElement('span');
        span.className = 'breadcrumb-item';
        span.setAttribute('role', 'button');
        span.setAttribute('tabindex', '0');
        span.textContent = '—';
        breadcrumbContainer.appendChild(span);
      }
      // asignar handlers de click a cada punto
      Array.from(breadcrumbContainer.children).forEach((node, idx) => {
        node.onclick = () => {
          firstIndex = idx * CARDS_PER_STEP;
          applyPosition();
        };
        node.onkeydown = (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            firstIndex = idx * CARDS_PER_STEP;
            applyPosition();
          }
        };
      });
    }

    // actualiza la UI del breadcrumb marcando el grupo activo
    function updateBreadcrumbUI() {
      if (!breadcrumbContainer) return;
      const totalGroups = groupCountFor(items.length);
      const normalizedFirst = ((firstIndex % items.length) + items.length) % items.length;
      const activeGroup = Math.floor(normalizedFirst / CARDS_PER_STEP) % totalGroups;
      const nodes = Array.from(breadcrumbContainer.children);
      nodes.forEach((n, i) => n.classList.toggle('active', i === activeGroup));
    }

    // calcula y aplica la posición de la tarjeta en firstIndex
    function applyPosition() {
      const total = items.length;
      // normalizar índice
      firstIndex = ((firstIndex % total) + total) % total;

      // targetLeft del elemento que queremos poner al principio del contenedor
      const targetEl = items[firstIndex];
      const targetLeft = targetEl ? targetEl.offsetLeft : 0;

      section.style.transform = `translateX(-${targetLeft}px)`;

      // actualizar breadcrumb después del transform
      updateBreadcrumbUI();
    }

    // avanzar/retroceder en bloques de 5 con wrap circular
    function stepNext() {
      firstIndex = firstIndex + CARDS_PER_STEP;
      applyPosition();
    }
    function stepPrev() {
      firstIndex = firstIndex - CARDS_PER_STEP;
      applyPosition();
    }

    // listeners
    nextBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      stepNext();
    });
    prevBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      stepPrev();
    });

    // soporte teclado para accesibilidad (flechas cuando hover dentro del carrusel)
    carousel.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') { stepNext(); }
      if (e.key === 'ArrowLeft') { stepPrev(); }
    });

    // al cambiar tamaño, recalculamos la posición actual para evitar offsets erróneos
    window.addEventListener('resize', () => {
      // recomponer breadcrumb por si cambió el número de grupos
      ensureBreadcrumb();
      requestAnimationFrame(applyPosition);
    });

    // init
    ensureBreadcrumb();
    applyPosition();
  });
});
