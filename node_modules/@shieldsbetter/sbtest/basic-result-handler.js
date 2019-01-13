module.exports = () => {
    let successCt = 0;
    let errors = [];
    let failures = [];
    let finalized = false;
    
    function checkFinalized() {
        if (finalized) {
            throw new Error('Call after result handler finalization.');
        }
    }
    
    return {
        success() {
            checkFinalized();
            
            successCt++;
        },
        
        error(path, e) {
            checkFinalized();
        
            errors.push({
                sourceTest: path,
                error: e
            });
        },
        
        failure(path, e) {
            checkFinalized();
            
            failures.push({
                sourceTest: path,
                error: e
            });
        },
        
        finalize() {
            finalized = true;
            
            if (errors.length === 0 && failures.length === 0) {
                console.log(`All ${successCt} test(s) passed.`);
            }
            else {
                failures.forEach(failure => {
                    console.log(`Test ${renderPath(failure.sourceTest)} failed:`);
                    console.log(failure.error.message);
                    
                    if ('expected' in failure.error) {
                        console.log();
                        console.log('Expected:');
                        console.log(failure.error.expected);
                    }
                    
                    if ('actual' in failure.error) {
                        console.log();
                        console.log('Actual:');
                        console.log(failure.error.actual);
                    }
                    
                    console.log();
                });
                
                errors.forEach(error => {
                    console.log(`Test ${renderPath(error.sourceTest)} ` +
                            `generated an error:`);
                    console.log(error.error);            
                    console.log();
                });
                
                const totalCt = errors.length + failures.length + successCt;
                
                let summary = `Ran ${totalCt} tests.`;
                const summaryParts = [];
                if (errors.length > 0) {
                    summaryParts.push(`Errors: ${errors.length}`);
                }
                
                if (failures.length > 0) {
                    summaryParts.push(`Failures: ${failures.length}`);
                }
                
                summaryParts.push(`Successes: ${successCt}`);
                
                console.log(`${summary}  ${summaryParts.join(', ')}.`);
            }
        }
    };
};

function renderPath(path) {
    let result = '';
    path.forEach(pathElement => {
        if (result.length > 0) {
            result += ' - ';
        }
        
        result += pathElement;
    });
    
    return result
}
