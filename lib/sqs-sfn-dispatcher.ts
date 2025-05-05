import { Construct } from "constructs";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";
import * as tasks from "aws-cdk-lib/aws-stepfunctions-tasks";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaEventSources from "aws-cdk-lib/aws-lambda-event-sources";
import { Duration } from "aws-cdk-lib";

interface SqsSfnDispatcherProps {
  source: sqs.IQueue;
  target: sfn.IStateMachine;
  batchSize?: number;
}

export class SqsSfnDispatcher extends Construct {
  public stateMachine: sfn.StateMachine;
  public triggerFunction: lambda.SingletonFunction;

  constructor(scope: Construct, id: string, props: SqsSfnDispatcherProps) {
    super(scope, id);

    const mapState = new sfn.Map(this, "Map", {
      itemsPath: "$.Messages",
      maxConcurrency: 10,
      // resultPath: "$.processedMessages",
      resultSelector: {
        "processedMessages.$": "$[?(@.Success == true)].Message",
      },
    });

    // Create a try-catch pattern for each item
    const processItem = new tasks.StepFunctionsStartExecution(
      this,
      "ProcessItem",
      {
        stateMachine: props.target,
        inputPath: "$.Body",
        integrationPattern: sfn.IntegrationPattern.RUN_JOB,
        resultPath: "$.executionResult",
      }
    );

    const success = new sfn.Pass(this, "Success", {
      parameters: {
        Message: {
          "Id.$": "States.Format('{}', States.UUID())",
          "ReceiptHandle.$": "$.ReceiptHandle",
        },
        Success: true,
      },
    });

    processItem.next(success);

    // Add a catch handler to the process item
    processItem.addCatch(
      new sfn.Pass(this, "Catch", {
        parameters: {
          Success: false,
        },
      })
    );

    mapState.itemProcessor(processItem);

    // Delete only successfully processed messages in batch using JSONPath filter
    const deleteMessages = new tasks.CallAwsService(
      this,
      "DeleteMessageBatch",
      {
        service: "sqs",
        action: "deleteMessageBatch",
        parameters: {
          QueueUrl: props.source.queueUrl,
          // Use JSONPath filter expression to select only successful messages
          "Entries.$": "$.processedMessages",
        },
        iamResources: [props.source.queueArn],
      }
    );

    const hasMessages = new sfn.Choice(this, "HasMessages", {
      queryLanguage: sfn.QueryLanguage.JSON_PATH,
    });

    hasMessages
      .when(sfn.Condition.isPresent("$.processedMessages[0]"), deleteMessages)
      .otherwise(new sfn.Succeed(this, "NoMessages"));
    mapState.next(hasMessages);

    const stateMachine = new sfn.StateMachine(this, "StateMachine", {
      definitionBody: sfn.DefinitionBody.fromChainable(mapState),
    });

    props.source.grant(stateMachine.role, "sqs:DeleteMessage");

    this.stateMachine = stateMachine;

    // Create the Lambda function that will trigger the state machine with inline code
    this.triggerFunction = new lambda.SingletonFunction(
      this,
      "TriggerFunction",
      {
        uuid: "8675309a-1234-5678-9abc-def0123456789", // Unique identifier for the singleton function
        runtime: lambda.Runtime.NODEJS_18_X,
        handler: "index.handler",
        code: lambda.Code.fromInline(`
        const { SFNClient, StartExecutionCommand } = require('@aws-sdk/client-sfn');
        
        const sfnClient = new SFNClient();
        const stateMachineArn = process.env.STATE_MACHINE_ARN;
        
        /**
         * Lambda function that receives SQS messages and forwards them to the dispatcher state machine.
         * It marks all messages as failed so that the Step Function remains responsible for deleting them.
         */
        exports.handler = async (event, context) => {
          console.log(\`Received \${event.Records.length} messages\`);
          
          if (event.Records.length === 0) {
            return { batchItemFailures: [] };
          }
        
          try {
            // Start a new execution of the state machine with the batch of messages
            const input = {
              Messages: event.Records.map(record => ({
                Body: record.body,
                ReceiptHandle: record.receiptHandle,
                MessageId: record.messageId,
                Attributes: record.attributes,
                MessageAttributes: record.messageAttributes,
              }))
            };
        
            const command = new StartExecutionCommand({
              stateMachineArn,
              input: JSON.stringify(input),
            });
        
            await sfnClient.send(command);
            console.log(\`Successfully started state machine execution with \${event.Records.length} messages\`);
            
            // Return all messages as failed so SQS won't delete them
            // The Step Function will be responsible for deleting messages after processing
            const batchItemFailures = event.Records.map(record => ({
              itemIdentifier: record.messageId
            }));
            
            return {
              batchItemFailures
            };
          } catch (error) {
            console.error('Error starting state machine execution:', error);
            
            // Return all messages as failed so they'll be retried
            const batchItemFailures = event.Records.map(record => ({
              itemIdentifier: record.messageId
            }));
            
            return {
              batchItemFailures
            };
          }
        };
      `),
        environment: {
          STATE_MACHINE_ARN: this.stateMachine.stateMachineArn,
        },
        description:
          "Lambda function that receives SQS messages and triggers the dispatcher state machine",
        timeout: Duration.seconds(30),
      }
    );

    // Grant the Lambda function permission to start executions of the state machine
    this.stateMachine.grantStartExecution(this.triggerFunction);

    // Add the SQS event source to the Lambda function
    this.triggerFunction.addEventSource(
      new lambdaEventSources.SqsEventSource(props.source, {
        batchSize: props.batchSize || 10,
        reportBatchItemFailures: true, // Enable partial batch responses
        maxBatchingWindow: Duration.seconds(5),
      })
    );
  }
}
