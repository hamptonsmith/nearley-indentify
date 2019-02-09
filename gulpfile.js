const gulp = require('gulp');

exports['format-markdown'] = formatMarkdown;
exports['format-javascript'] = formatJavascript;

function formatMarkdown(cb) {
    const format = require('gulp-prettier');
    
    return gulp.src('README.md', { base: './' })
            .pipe(format({ proseWrap: 'always' }))
            .pipe(gulp.dest('./'));
}

function formatJavascript(cb) {
    const format = require('gulp-prettier');
    
    // I tried to stick to default Prettier formatting, I really did.  But
    // combining "} else {" with tab width 2 is objectively wrong.
    return gulp.src(['**/*.js', '!./**/node_modules/**/*'], { base: './' })
            .pipe(format({ tabWidth: 4 }))
            .pipe(gulp.dest('./'));
}
