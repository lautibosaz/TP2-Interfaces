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
  if (e.key === 'Enter' || e.key === ' ') { 
    e.preventDefault(); 
    toggleMenu(); 
  }
});

backdrop?.addEventListener('click', closeMenu);
closeBtn?.addEventListener('click', closeMenu);

/* Cerrar con ESC */
document.addEventListener('keydown', (e) => { 
  if (e.key === 'Escape') closeMenu(); 
});

/* Cerrar al hacer click en una categoría */
sideMenu?.addEventListener('click', (e) => {
  const link = e.target.closest('.cat-btn');
  if (link) closeMenu();
});






document.addEventListener('DOMContentLoaded', function() {
  var likes = document.querySelectorAll('.iconoLike');
  likes.forEach(function(icon) {
    icon.addEventListener('click', function() {
      if (icon.src.includes('like2.png')) {
        icon.src = 'img/like.png';
      } else {
        icon.src = 'img/like2.png';
      }
    });
  });
});
