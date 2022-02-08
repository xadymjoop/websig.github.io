function validate(){
var username = document.getElementById("username").value;
var password = document.getElementById("password").value;
if ( username == "sahelgeo" && password == "sahel1951"){
alert ("Login successfully");
window.location = "map.html"; // Redirecting to other page.
return false;
  }
  else{
    alert("Invalid username or password");
    }
  return false;
  }
