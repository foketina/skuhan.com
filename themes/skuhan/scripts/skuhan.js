(function ($, Drupal, drupalSettings) {
  Drupal.behaviors.skuhanDefault = {
    attach: function (context, settings) {
      var isFront = $('.is-front').text();
      // Counterup numbers.
      if ($('.count-number').length) {
        $('.count-number').counterUp({
          delay: 30,
          time: 1000
        });
      }
      // Slideshow particals.
      if (isFront == '1') {
        particlesJS.load('skuhan-particles', 'themes/skuhan/scripts/particles.json', function() {
        });
      }
      // Slideshow Typed Library
      if($(".typed-text").length) {
        $(".typed-text").typed({
          strings: ["Web application Architect", "Web Application Developer", "Drupal, Laravel and Symfony specialist"],
          typeSpeed: 10,
          backSpeed: 6,
          backDelay: 2000,
          loop: true
        });
      }
      // Animation with waypoints.
      $('.animated-row').each(function(){
        var $this = $(this);
        $this.find('.animate').each(function(i){
          var $item = $(this);
          var animation = $item.data('animate');
          $item.waypoint(function(){
            setTimeout(function () {
              $item.addClass('animated '+animation).removeClass('animate');
            }, i*50);
          },
          {
            offset: '100%',
            triggerOnce: true
          });
        });
      });
      // About Me skills.
      if ($('.about-skills').length !== 0) {
  			var skillbar_active = false;
  			$('.progress-bar-value').hide();
  			if ($(window).scrollTop() === 0 && isScrolledIntoView($('.about-skills')) === true) {
  				skillbarActive();
  				skillbar_active = true;
  			} else if (isScrolledIntoView($('.about-skills')) === true) {
  				skillbarActive();
  				skillbar_active = true;
  			}
  			$(window).bind('scroll', function() {
  				if (skillbar_active === false && isScrolledIntoView($('.about-skills')) === true) {
  					skillbarActive();
  					skillbar_active = true;
  				}
  			});
  		}
  		// Main Menu Smooth scroll.
  		if (isFront == '1') {
  		  $("ul.menu--skuhan-main-menu li a").click(function(e) {
          e.preventDefault();
          var sectionID = '#' + $(this).attr("data-link-id");
          $("body, html").animate({
            scrollTop: $(sectionID).offset().top
          });
        });
  		}
      // Scroll button slider.
      $(".scroll-down").click(function(e) {
        e.preventDefault();
        var sectionID = '#' + $(this).attr("data-link-id");
        $("body, html").animate({
          scrollTop: $(sectionID).offset().top
        });
      });
      // Back to top arrow.
      $(window).on('scroll',function () {
        if( $(window).scrollTop() > 200 ){
          $('.back-top').fadeIn();
        } else {
          $('.back-top').fadeOut();
        }
      });
      $('.back-top').on('click', function() {
        $('html:not(:animated),body:not(:animated)').animate({ scrollTop:0}, 'normal');
        return false;
      });
      // Preloader.
      $(window).on('load', function() {
        $('.preloader-bounce').fadeOut();
        $('.preloader').delay(350).fadeOut('slow');
      });
  		function isScrolledIntoView(elem) {
  			var docViewTop = $(window).scrollTop();
  			var docViewBottom = docViewTop + $(window).height();
  			var elemTop = $(elem).offset().top;
  			var elemBottom = elemTop + $(elem).height();
  			return ((elemBottom <= (docViewBottom + $(elem).height())) && (elemTop >= (docViewTop - $(elem).height())));
  		}
  		function skillbarActive() {
  			setTimeout(function() {
  				$('.progress-bar-value').each(function() {
  				  var skillBarPercentage = $(this).attr('data-percentage');
  					$(this).data("origWidth", $(this)[0].style.width).css('width', '1%').show();
  					$(this).animate({
  						width: skillBarPercentage					
  					}, 1600);
  				});
  			}, 250);
  		}
    }
  };
  Drupal.behaviors.skuhanMobile = {
    attach: function (context, settings) {
      $(".skuhan-header-container button.navbar-toggle").on("click", function() {
        $(this).find('.fa').toggleClass("fa-bars fa-times");
      });
      
    }
  }
})(jQuery, Drupal, drupalSettings);