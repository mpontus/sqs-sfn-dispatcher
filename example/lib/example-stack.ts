import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { ExampleStepFunction } from './example-step-function';
// import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { CfnPipe } from 'aws-cdk-lib/aws-pipes';
import * as iam from 'aws-cdk-lib/aws-iam';


/**
 * 0. Singleton step function
 * 1. Shape of input from SQS
 * 2. Invoking different step function for each message
 * 3. Error handling
 * 9. integ tests
 */

export class ExampleStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const queue = new sqs.Queue(this, 'Queue', {
      visibilityTimeout: cdk.Duration.seconds(300)
    });

    const sampleStepMachine = new ExampleStepFunction(this, 'SampleStepMachine');

    const role = new iam.Role(this, 'Role', {
      assumedBy: new iam.ServicePrincipal('pipes.amazonaws.com')
    });
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"],
        resources: [queue.queueArn],
      }),
    )
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ["states:StartExecution"],
        resources: [sampleStepMachine.stateMachine.stateMachineArn],
      })
    )

    new CfnPipe(this, 'Pipe', {
      roleArn: role.roleArn,
      source: queue.queueArn,
      sourceParameters: {
        sqsQueueParameters: {
          batchSize: 1
        }
      },
      target: sampleStepMachine.stateMachine.stateMachineArn,
      targetParameters: {
        stepFunctionStateMachineParameters: {
        }
      },
    });
      


    // The code that defines your stack goes here

    // example resource
    // const queue = new sqs.Queue(this, 'ExampleQueue', {
    //   visibilityTimeout: cdk.Duration.seconds(300)
    // });
  }
}
