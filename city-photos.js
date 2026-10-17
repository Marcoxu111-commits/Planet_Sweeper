// Photos appear only for a selected city/region, never as featured demo cities.
(() => {
  const photos = [
    { match: /^toronto\b|^old toronto\b/, src: "assets/cities/toronto.jpg", alt: "Toronto waterfront skyline", credit: "Toronto · Unsplash", source: "https://images.unsplash.com/photo-1517935706615-2717063c2225", license: "https://unsplash.com/license", licenseName: "Unsplash license" },
    { match: /^new york\b/, src: "assets/cities/new-york.jpg", alt: "New York skyline and Empire State Building", credit: "New York · Unsplash", source: "https://images.unsplash.com/photo-1485871981521-5b1fd3805eee", license: "https://unsplash.com/license", licenseName: "Unsplash license" },
    { match: /^chicago\b/, src: "assets/cities/chicago.jpg", alt: "Chicago Theatre on State Street", credit: "Chicago · Unsplash", source: "https://images.unsplash.com/photo-1494522358652-f30e61a60313", license: "https://unsplash.com/license", licenseName: "Unsplash license" },
    { match: /^markham\b/, src: "assets/cities/markham.jpg", alt: "Main Street in Markham Village's heritage district", credit: "Mhsheikholeslami · Wikimedia Commons", source: "https://commons.wikimedia.org/wiki/File:Markham_Village_Heritage_Conservation_District-_Markham-Ontario-HPC15250-20201017_(2).jpg", license: "https://creativecommons.org/licenses/by-sa/4.0/", licenseName: "CC BY-SA 4.0 · resized" },
    { match: /^etobicoke\b/, src: "assets/cities/etobicoke.jpg", alt: "The Queensway–Humber Bay neighbourhood in Etobicoke", credit: "Canmenwalker · Wikimedia Commons", source: "https://commons.wikimedia.org/wiki/File:The_Queensway_%E2%80%93_Humber_Bay_2024.jpg", license: "https://creativecommons.org/licenses/by/4.0/", licenseName: "CC BY 4.0 · resized" },
  ];
  function get(name) {
    const normalized = String(name).replace(/^\d+\s*[—–-]\s*/, "").trim().toLowerCase();
    return photos.find((photo) => photo.match.test(normalized));
  }
  function caption(photo) {
    const element = document.createElement("small");
    const source = document.createElement("a"), license = document.createElement("a");
    source.href = photo.source; source.textContent = photo.credit;
    license.href = photo.license; license.textContent = photo.licenseName;
    for (const link of [source, license]) { link.target = "_blank"; link.rel = "noopener noreferrer"; }
    element.append(source, " · ", license);
    return element;
  }
  function figure(name) {
    const photo = get(name);
    if (!photo) return null;
    const element = document.createElement("figure"), image = document.createElement("img"), credit = document.createElement("figcaption");
    element.className = "region-photo"; image.src = photo.src; image.alt = photo.alt;
    credit.append(caption(photo)); element.append(image, credit);
    return element;
  }
  window.PlanetCityPhotos = { get, caption, figure };
})();
